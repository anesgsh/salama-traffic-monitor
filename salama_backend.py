"""
Salama — Backend v7 (Maximum FPS)
===================================
Install:
    pip install fastapi uvicorn[standard] python-multipart openvino opencv-python

Run:
    python salama_backend.py

How we match PyQt5 FPS:
  PyQt5: worker emits numpy array → Qt renders directly. No JPEG, no network.
  Web equivalent of that pipeline:
    1. Worker thread: inference + violation logic only. NO encode, NO lock.
       Writes raw numpy frame into a shared slot.
    2. Encode thread: reads slot, calls cv2.imencode, sets asyncio.Event.
       Completely separate from inference — runs concurrently.
    3. WS sender coroutine: waits on asyncio.Event (zero-latency wake),
       reads the JPEG bytes, sends immediately.

  asyncio.Event.set() is called from the encode thread via
  loop.call_soon_threadsafe — this is a single O(1) operation that wakes
  the WS sender on the very next event loop iteration, with no sleep() overhead.

  Result: inference never waits for network. Encode never waits for inference.
  WS sender wakes instantly when a new frame is ready.
"""

import os, cv2, time, json, base64, asyncio, threading, queue as _queue
import numpy as np
from collections import deque, defaultdict
from datetime import datetime, timedelta

import openvino as ov
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# ── Config ────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(
    BASE_DIR, "model","merged_traffic_model_int8_ov.xml"
)
SAVE_DIR = os.path.join(BASE_DIR, "violations")
os.makedirs(os.path.join(SAVE_DIR, "snapshots"), exist_ok=True)
os.makedirs(os.path.join(SAVE_DIR, "clips"),     exist_ok=True)

NAMES = {
    0:'person',1:'bicycle',2:'car',3:'motorcycle',4:'airplane',
    5:'bus',6:'train',7:'truck',8:'boat',9:'traffic light',
    10:'fire hydrant',11:'stop sign',12:'parking meter',13:'bench',
    14:'bird',15:'cat',16:'dog',17:'horse',18:'sheep',19:'cow',
    20:'elephant',21:'bear',22:'zebra',23:'giraffe',24:'backpack',
    25:'umbrella',26:'handbag',27:'tie',28:'suitcase',29:'frisbee',
    30:'skis',31:'snowboard',32:'sports ball',33:'kite',34:'baseball bat',
    35:'baseball glove',36:'skateboard',37:'surfboard',38:'tennis racket',
    39:'bottle',40:'wine glass',41:'cup',42:'fork',43:'knife',
    44:'spoon',45:'bowl',46:'banana',47:'apple',48:'sandwich',
    49:'orange',50:'broccoli',51:'carrot',52:'hot dog',53:'pizza',
    54:'donut',55:'cake',56:'chair',57:'couch',58:'potted plant',
    59:'bed',60:'dining table',61:'toilet',62:'tv',63:'laptop',
    64:'mouse',65:'remote',66:'keyboard',67:'cell phone',68:'microwave',
    69:'oven',70:'toaster',71:'sink',72:'refrigerator',73:'book',
    74:'clock',75:'vase',76:'scissors',77:'teddy bear',78:'hair drier',
    79:'toothbrush',
    80:'red light',81:'green light',82:'no entry',
    83:'no left turn',84:'no right turn',
}
VEHICLE_CLASSES = {2,3,5,7}
SIGN_CLASSES    = {11,80,82,83,84}
VIOLATION_NAMES = {
    11:'Stop Sign Violation', 80:'Red Light Running',
    82:'No Entry Violation',  83:'No Left Turn Violation',
    84:'No Right Turn Violation',
}
VIOL_COLOR_BGR = {
    11:(0,215,255), 80:(50,50,255),
    82:(0,140,255), 83:(255,160,0), 84:(80,220,80),
}

# ── Load model ────────────────────────────────────────────────
print("Loading OpenVINO INT8 model...")
core           = ov.Core()
compiled_model = core.compile_model(MODEL_PATH, "CPU", {"PERFORMANCE_HINT": "LATENCY"})
infer_request  = compiled_model.create_infer_request()
output_layer   = compiled_model.output(0)
print("✅ Model loaded")

# ── Inference ─────────────────────────────────────────────────
def preprocess(frame):
    img = cv2.resize(frame, (640,640), interpolation=cv2.INTER_NEAREST)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return np.ascontiguousarray(img.transpose(2,0,1)[np.newaxis])

def run_inference(frame):
    return infer_request.infer({0: preprocess(frame)})[output_layer]

def postprocess(output, orig_w, orig_h, conf_thresh=0.25, iou_thresh=0.45):
    preds = output[0].T
    boxes, scores, class_ids = [], [], []
    for pred in preds:
        obj_scores = pred[4:]
        class_id   = int(np.argmax(obj_scores))
        score      = float(obj_scores[class_id])
        if score < conf_thresh: continue
        if class_id not in VEHICLE_CLASSES and class_id not in SIGN_CLASSES: continue
        cx,cy,w,h = pred[0],pred[1],pred[2],pred[3]
        x1=max(0,int((cx-w/2)*orig_w/640)); y1=max(0,int((cy-h/2)*orig_h/640))
        x2=min(orig_w,int((cx+w/2)*orig_w/640)); y2=min(orig_h,int((cy+h/2)*orig_h/640))
        boxes.append([x1,y1,x2-x1,y2-y1]); scores.append(score); class_ids.append(class_id)
    if not boxes: return [],[],[]
    idx = cv2.dnn.NMSBoxes(boxes, scores, conf_thresh, iou_thresh)
    if len(idx)==0: return [],[],[]
    idx = idx.flatten()
    return [[b[0],b[1],b[0]+b[2],b[1]+b[3]] for b in [boxes[i] for i in idx]], \
           [scores[i] for i in idx], [class_ids[i] for i in idx]

# ── Tracker ───────────────────────────────────────────────────
class SimpleTracker:
    def __init__(self, max_age=10, iou_threshold=0.3):
        self.tracks={}; self.next_id=1
        self.max_age=max_age; self.iou_thresh=iou_threshold

    def _iou(self,b1,b2):
        xa=max(b1[0],b2[0]);ya=max(b1[1],b2[1])
        xb=min(b1[2],b2[2]);yb=min(b1[3],b2[3])
        inter=max(0,xb-xa)*max(0,yb-ya)
        union=(b1[2]-b1[0])*(b1[3]-b1[1])+(b2[2]-b2[0])*(b2[3]-b2[1])-inter
        return inter/union if union>0 else 0

    def update(self,dets,cls_ids=None):
        if cls_ids is None: cls_ids=[None]*len(dets)
        for tid in list(self.tracks):
            self.tracks[tid]['age']+=1
            if self.tracks[tid]['age']>self.max_age: del self.tracks[tid]
        matched=set(); results=[]
        for det,cid in zip(dets,cls_ids):
            best_iou,best_id=0,None
            for tid,t in self.tracks.items():
                if tid in matched: continue
                v=self._iou(det,t['bbox'])
                if v>best_iou: best_iou,best_id=v,tid
            if best_id and best_iou>=self.iou_thresh:
                t=self.tracks[best_id]; t['bbox']=det; t['age']=0
                if cid is not None: t['class_id']=cid
                cx=(det[0]+det[2])//2; cy=(det[1]+det[3])//2
                t['positions'].append((cx,cy))
                if len(t['positions'])>60: t['positions'].pop(0)
                matched.add(best_id); results.append((best_id,det,t.get('class_id')))
            else:
                tid=self.next_id; self.next_id+=1
                cx=(det[0]+det[2])//2; cy=(det[1]+det[3])//2
                self.tracks[tid]={'bbox':det,'age':0,'positions':[(cx,cy)],'class_id':cid}
                results.append((tid,det,cid))
        return results

    def get_direction(self,tid):
        if tid not in self.tracks: return 'none'
        pos=self.tracks[tid]['positions']
        if len(pos)<6: return 'none'
        dx=pos[-1][0]-pos[-6][0]; dy=pos[-1][1]-pos[-6][1]
        if abs(dx)<5 and abs(dy)<5: return 'none'
        return ('left' if dx<0 else 'right') if abs(dx)>abs(dy) else ('up' if dy<0 else 'down')

    def get_speed(self,tid):
        if tid not in self.tracks: return 0
        pos=self.tracks[tid]['positions']
        if len(pos)<2: return 0
        return float(np.sqrt((pos[-1][0]-pos[-2][0])**2+(pos[-1][1]-pos[-2][1])**2))

# ── Violation logic ───────────────────────────────────────────
stop_sign_state = defaultdict(lambda:{'frames_in_zone':0,'frames_stopped':0,'crossed':False})
def reset_violations(): stop_sign_state.clear()

def check_violation(sign_class,vehicle_bbox,sign_bbox,tracker,vehicle_id,fw,fh):
    vx=(vehicle_bbox[0]+vehicle_bbox[2])/2; vy=(vehicle_bbox[1]+vehicle_bbox[3])/2
    if sign_class==11:
        sy2=sign_bbox[3]; st=stop_sign_state[vehicle_id]
        if vy>sy2:
            st['frames_in_zone']+=1
            st['frames_stopped']=st['frames_stopped']+1 if tracker.get_speed(vehicle_id)<3 else 0
        else:
            if st['frames_in_zone']>5 and not st['crossed']:
                st['crossed']=True
                if st['frames_stopped']<30: return True
            if st['frames_in_zone']>0 and vy<sy2-20:
                st.update({'frames_in_zone':0,'frames_stopped':0,'crossed':False})
        return False
    elif sign_class==80:
        sx1,sy1,sx2,sy2=sign_bbox; cx=(sx1+sx2)/2; cy=(sy1+sy2)/2
        hw=(sx2-sx1)/2*5.0; hh=(sy2-sy1)/2*5.0
        zone=[cx-hw,cy-hh,cx+hw,cy+hh]
        in_z=not(vehicle_bbox[2]<zone[0] or vehicle_bbox[0]>zone[2] or
                  vehicle_bbox[3]<zone[1] or vehicle_bbox[1]>zone[3])
        return vy>cy and in_z and tracker.get_direction(vehicle_id)!='none'
    elif sign_class==83:
        sx1,sy1,sx2,sy2=sign_bbox
        if sx2==sx1: return False
        line_y=(sy1-sy2)/(sx2-sx1)*(vx-sx1)+sy2
        pos=tracker.tracks.get(vehicle_id,{}).get('positions',[])
        if len(pos)<8: return False
        dx=pos[-1][0]-pos[-8][0]; dy=pos[-1][1]-pos[-8][1]
        return np.sqrt(dx**2+dy**2)>=8 and dy<-5 and dx<-5 and vy<line_y
    elif sign_class==84:
        sx1,sy1,sx2,sy2=sign_bbox
        if sx2==sx1: return False
        line_y=(sy1-sy2)/(sx2-sx1)*(vx-sx1)+sy2
        pos=tracker.tracks.get(vehicle_id,{}).get('positions',[])
        if len(pos)<8: return False
        dx=pos[-1][0]-pos[-8][0]; dy=pos[-1][1]-pos[-8][1]
        return np.sqrt(dx**2+dy**2)>=8 and dy<-5 and dx>5 and vy<line_y
    elif sign_class==82:
        sx1,sy1,sx2,sy2=sign_bbox; cx=(sx1+sx2)/2; cy=(sy1+sy2)/2
        hw=(sx2-sx1)/2*2.0; hh=(sy2-sy1)/2*2.0
        zone=[cx-hw,cy-hh,cx+hw,cy+hh]
        return not(vehicle_bbox[2]<zone[0] or vehicle_bbox[0]>zone[2] or
                    vehicle_bbox[3]<zone[1] or vehicle_bbox[1]>zone[3])
    return False

# ── Draw — identical to PyQt5 draw_boxes ─────────────────────
def draw_boxes(frame, vehicle_tracks, sign_dets, active_violations, avg_fps,
               frame_idx, scene, tracker, show_zones, orig_w, orig_h):
    h,w=frame.shape[:2]
    # Header bar
    ov_hdr=frame.copy()
    cv2.rectangle(ov_hdr,(0,0),(w,46),(6,6,14),-1)
    cv2.addWeighted(ov_hdr,0.85,frame,0.15,0,frame)
    cv2.putText(frame,f'SALAMA  |  {scene}  |  {avg_fps:.0f} FPS  |  frame {frame_idx}',
                (12,30),cv2.FONT_HERSHEY_SIMPLEX,0.62,(0,224,180),2)
    # Vehicles
    for vid,bbox,cid in vehicle_tracks:
        x1,y1,x2,y2=bbox
        vtype=NAMES.get(cid,'vehicle').upper() if cid else 'VEHICLE'
        if vid in active_violations:
            scls=next((s for s,n in VIOLATION_NAMES.items() if n==active_violations[vid]),None)
            color=VIOL_COLOR_BGR.get(scls,(50,50,255))
            lbl=f'{vtype} #{vid}  !! {active_violations[vid]}'
        else:
            color=(0,230,90); lbl=f'{vtype} #{vid}'
        cv2.rectangle(frame,(x1,y1),(x2,y2),color,2)
        cv2.putText(frame,lbl,(x1,max(y1-8,52)),cv2.FONT_HERSHEY_SIMPLEX,0.52,color,2)
    # Signs
    for bbox,cid,sc in sign_dets:
        x1,y1,x2,y2=bbox
        cv2.rectangle(frame,(x1,y1),(x2,y2),(0,165,255),2)
        cv2.putText(frame,f'{NAMES.get(cid,str(cid))} {sc:.2f}',
                    (x1,max(y1-8,52)),cv2.FONT_HERSHEY_SIMPLEX,0.48,(0,165,255),2)
    # Violation banner
    if active_violations:
        ov2=frame.copy()
        cv2.rectangle(ov2,(0,h-52),(w,h),(10,0,120),-1)
        cv2.addWeighted(ov2,0.70,frame,0.30,0,frame)
        for i,(vid,vn) in enumerate(active_violations.items()):
            vcls=tracker.tracks.get(vid,{}).get('class_id')
            vt=NAMES.get(vcls,'vehicle').upper() if vcls else 'VEHICLE'
            cv2.putText(frame,f'VIOLATION  {vt} #{vid} - {vn}',
                        (12,h-28+i*22),cv2.FONT_HERSHEY_SIMPLEX,0.62,(255,80,80),2)
    # Zones — identical logic to PyQt5
    if show_zones:
        for sbbox,scls,_ in sign_dets:
            sx1,sy1,sx2,sy2=sbbox
            if scls==11:
                overlay=frame.copy()
                cv2.rectangle(overlay,(0,sy2),(orig_w,orig_h),(0,255,255),-1)
                cv2.addWeighted(overlay,0.15,frame,0.85,0,frame)
                cv2.line(frame,(0,sy2),(orig_w,sy2),(0,255,255),2)
                cv2.putText(frame,'STOP ZONE',(10,sy2-8),cv2.FONT_HERSHEY_SIMPLEX,0.55,(0,255,255),2)
            elif scls==80:
                cx=(sx1+sx2)/2; cy=(sy1+sy2)/2
                hw=(sx2-sx1)/2*5; hh=(sy2-sy1)/2*5
                zx1,zy1,zx2,zy2=int(cx-hw),int(cy),int(cx+hw),int(cy+hh*2)
                overlay=frame.copy()
                cv2.rectangle(overlay,(zx1,zy1),(zx2,zy2),(0,0,255),-1)
                cv2.addWeighted(overlay,0.2,frame,0.8,0,frame)
                cv2.rectangle(frame,(zx1,zy1),(zx2,zy2),(0,0,255),2)
                cv2.putText(frame,'RED LIGHT ZONE',(zx1,zy1-8),cv2.FONT_HERSHEY_SIMPLEX,0.55,(0,0,255),2)
            elif scls==83 and sx2!=sx1:
                slope=(sy1-sy2)/(sx2-sx1)
                yl=int(slope*(0-sx1)+sy2); yr=int(slope*(orig_w-sx1)+sy2)
                cv2.line(frame,(0,yl),(orig_w,yr),(0,255,0),2)
                cv2.putText(frame,'NO LEFT TURN LINE',(10,min(yl,yr)-8),
                            cv2.FONT_HERSHEY_SIMPLEX,0.55,(0,255,0),2)
            elif scls==84 and sx2!=sx1:
                slope=(sy1-sy2)/(sx2-sx1)
                yl=int(slope*(0-sx1)+sy2); yr=int(slope*(orig_w-sx1)+sy2)
                cv2.line(frame,(0,yl),(orig_w,yr),(255,165,0),2)
                cv2.putText(frame,'NO RIGHT TURN LINE',(10,min(yl,yr)-8),
                            cv2.FONT_HERSHEY_SIMPLEX,0.55,(255,165,0),2)
            elif scls==82:
                cx=(sx1+sx2)/2; cy=(sy1+sy2)/2
                hw=(sx2-sx1)/2*2; hh=(sy2-sy1)/2*2
                zx1,zy1,zx2,zy2=int(cx-hw),int(cy-hh),int(cx+hw),int(cy+hh)
                overlay=frame.copy()
                cv2.rectangle(overlay,(zx1,zy1),(zx2,zy2),(0,255,255),-1)
                cv2.addWeighted(overlay,0.2,frame,0.8,0,frame)
                cv2.rectangle(frame,(zx1,zy1),(zx2,zy2),(0,255,255),2)
                cv2.putText(frame,'NO ENTRY ZONE',(zx1,zy1-8),
                            cv2.FONT_HERSHEY_SIMPLEX,0.55,(0,255,255),2)
    return frame

# ══════════════════════════════════════════════════════════════
# SHARED FRAME PIPELINE
#
#  Worker thread
#    │  writes raw numpy frame (no encode) into _raw_slot
#    │  sets _raw_event (threading.Event)
#    ▼
#  Encode thread  (mirrors PyQt5 display thread)
#    │  waits on _raw_event
#    │  calls cv2.imencode → produces JPEG bytes
#    │  writes JPEG into _jpeg_slot
#    │  calls loop.call_soon_threadsafe(_jpeg_event.set)
#    ▼
#  WS sender coroutine (asyncio)
#    │  awaits _jpeg_event (asyncio.Event — wakes instantly)
#    │  reads _jpeg_slot
#    │  sends bytes over WebSocket
#
# This is the minimum-latency pipeline achievable in Python.
# The encode thread never starves the worker.
# The WS sender never polls — it wakes only when a frame is ready.
# ══════════════════════════════════════════════════════════════

# Worker → Encode thread
_raw_lock  = threading.Lock()
_raw_slot  = None        # numpy ndarray | None
_raw_event = threading.Event()

# Encode thread → WS sender
_jpeg_lock = threading.Lock()
_jpeg_slot = None        # bytes | None (None = stream ended)
_jpeg_event: asyncio.Event = None   # created in startup

# Generation counter — prevents stale end-sentinel from previous session
_generation = 0

# Event and stats queues
event_q: _queue.Queue = _queue.Queue()

# ── Persistent app state ──────────────────────────────────────
class AppState:
    running    = False
    fps        = 0.0
    frame_idx  = 0
    total      = 0
    vehicles   = 0
    scene      = ''
    veh_frame  = {2:0,3:0,5:0,7:0}
    # Accumulated — never reset across sessions
    all_violations: list = []
    all_veh_log:    list = []
    all_veh_counts       = {2:0,3:0,5:0,7:0}

state          = AppState()
_worker_thread = None
_stop_event    = threading.Event()
UPLOAD_PATH    = "uploaded_video.mp4"

# ── Snapshot IO thread ────────────────────────────────────────
_snap_q: _queue.Queue = _queue.Queue()

def _snap_io_fn():
    while True:
        item = _snap_q.get()
        if item is None: break
        snap,snap_path,orig_w,orig_h,holder = item
        cv2.imwrite(snap_path, snap, [cv2.IMWRITE_JPEG_QUALITY, 95])
        th_h=int(320*orig_h/orig_w); thumb=cv2.resize(snap,(320,th_h))
        _,jpg=cv2.imencode('.jpg',thumb,[cv2.IMWRITE_JPEG_QUALITY,90])
        holder[0]=base64.b64encode(jpg.tobytes()).decode()
        _snap_q.task_done()

threading.Thread(target=_snap_io_fn, daemon=True).start()

# ── Encode thread ─────────────────────────────────────────────
# Mirrors PyQt5's display thread — completely separate from inference.
def _encode_thread_fn():
    global _jpeg_slot
    while True:
        _raw_event.wait()          # block until worker signals a new frame
        _raw_event.clear()

        with _raw_lock:
            frame = _raw_slot      # grab reference (no copy needed)

        if frame is None:
            # None = worker finished — propagate the end signal
            with _jpeg_lock:
                _jpeg_slot = None
            if _jpeg_event and _loop:
                _loop.call_soon_threadsafe(_jpeg_event.set)
            continue

        ok, jpg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            with _jpeg_lock:
                _jpeg_slot = jpg.tobytes()
            if _jpeg_event and _loop:
                _loop.call_soon_threadsafe(_jpeg_event.set)

threading.Thread(target=_encode_thread_fn, daemon=True).start()

# ── Worker thread ─────────────────────────────────────────────
def worker_fn(video_path, conf, iou, show_zones, scene, my_generation):
    global _raw_slot

    state.running=True; state.scene=scene
    reset_violations()

    cap     = cv2.VideoCapture(video_path)
    total   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    orig_w  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    buf_sz  = int(src_fps*5)
    state.total=total

    tracker          = SimpleTracker()
    fbuf             = deque(maxlen=buf_sz)
    fidx=0; display_idx=0
    last_boxes,last_scores,last_class_ids=[],[],[]
    viol_state={}; violated_already=defaultdict(set)
    violated_vehicles=set(); sign_class_stable=defaultdict(int)
    seen_vehicles=set()

    # Identical to PyQt5: t_start used for avg_fps computation
    t_start      = time.time()
    last_veh_log = time.perf_counter()

    while not _stop_event.is_set():
        ret,frame=cap.read()
        if not ret: break
        fbuf.append(frame.copy())
        fidx+=1

        # Inference every 4th frame — identical to PyQt5
        if fidx%4==0:
            raw=run_inference(frame)
            last_boxes,last_scores,last_class_ids=postprocess(raw,orig_w,orig_h,conf,iou)

        vehicle_boxes=[(b,c) for b,c in zip(last_boxes,last_class_ids) if c in VEHICLE_CLASSES]
        sign_dets=[(b,c,s) for b,c,s in zip(last_boxes,last_class_ids,last_scores) if c in SIGN_CLASSES]
        vtracks=tracker.update([b for b,_ in vehicle_boxes],[c for _,c in vehicle_boxes])

        # Sign stability
        cur_signs={c for _,c,_ in sign_dets}
        for sc in list(sign_class_stable):
            sign_class_stable[sc]=sign_class_stable[sc]+1 if sc in cur_signs else 0
        for sc in cur_signs:
            if sc not in sign_class_stable: sign_class_stable[sc]=1

        # Vehicle counts
        cur_frame_counts={2:0,3:0,5:0,7:0}
        for vid,bbox,cid in vtracks:
            if cid in VEHICLE_CLASSES:
                cur_frame_counts[cid]+=1
                if vid not in seen_vehicles:
                    seen_vehicles.add(vid); state.all_veh_counts[cid]+=1
        state.veh_frame=dict(cur_frame_counts)

        t_now=time.perf_counter()
        if t_now-last_veh_log>=2.0:
            state.all_veh_log.append({'ts':datetime.now().isoformat(),'scene':scene,
                                       'counts':dict(cur_frame_counts),
                                       'total':sum(cur_frame_counts.values())})
            last_veh_log=t_now

        # Violation check
        active_v={}
        for vid,vbbox,vcid in vtracks:
            if vid in violated_vehicles: continue
            vtype=NAMES.get(vcid,'vehicle').upper() if vcid else 'VEHICLE'
            for sbbox,sc,_ in sign_dets:
                if sc in violated_already[vid]: continue
                if sign_class_stable.get(sc,0)<5: continue
                if check_violation(sc,vbbox,sbbox,tracker,vid,orig_w,orig_h):
                    vn=VIOLATION_NAMES.get(sc,'Unknown')
                    violated_already[vid].add(sc); violated_vehicles.add(vid); active_v[vid]=vn
                    ts=datetime.now().strftime('%Y%m%d_%H%M%S'); safe_v=vn.replace(' ','_')
                    snap_filename=f'{scene}_{vtype}{vid}_{safe_v}_{ts}.jpg'
                    snap_path=os.path.join(SAVE_DIR,'snapshots',snap_filename)
                    snap=frame.copy()
                    x1,y1,x2,y2=vbbox
                    cv2.rectangle(snap,(x1,y1),(x2,y2),(0,0,255),3)
                    cv2.putText(snap,f'{vtype} #{vid} - {vn}',(x1,max(y1-12,20)),
                                cv2.FONT_HERSHEY_SIMPLEX,0.9,(0,0,255),2)
                    sx1o,sy1o,sx2o,sy2o=sbbox
                    cv2.rectangle(snap,(sx1o,sy1o),(sx2o,sy2o),(0,165,255),3)
                    cv2.putText(snap,NAMES.get(sc,str(sc)),(sx1o,max(sy1o-12,20)),
                                cv2.FONT_HERSHEY_SIMPLEX,0.9,(0,165,255),2)
                    cv2.putText(snap,f'{scene} | {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}',
                                (10,snap.shape[0]-15),cv2.FONT_HERSHEY_SIMPLEX,0.7,(255,255,255),2)
                    holder=[None]
                    _snap_q.put((snap,snap_path,orig_w,orig_h,holder))
                    _snap_q.join()
                    ev={'type':'violation','vehicle_id':vid,'vehicle_type':vtype,
                        'violation':vn,'sign_class':sc,'scene':scene,
                        'time':datetime.now().isoformat(),
                        'snap_filename':snap_filename,'snap_path':snap_path,
                        'thumb_b64':holder[0] or ''}
                    event_q.put(ev); state.all_violations.append(ev)
                    print(f'🚨 {vn} — {vtype} #{vid}')
                    clip_path=os.path.join(SAVE_DIR,'clips',
                                           f'{scene}_{vtype}{vid}_{safe_v}_{ts}.mp4')
                    h_f,w_f=frame.shape[:2]
                    writer=cv2.VideoWriter(clip_path,cv2.VideoWriter_fourcc(*'mp4v'),src_fps,(w_f,h_f))
                    for bf in list(fbuf): writer.write(bf)
                    viol_state[vid]={'writer':writer,'after_count':0}

        for vid in list(viol_state):
            viol_state[vid]['writer'].write(frame)
            viol_state[vid]['after_count']+=1
            if viol_state[vid]['after_count']>=buf_sz:
                viol_state[vid]['writer'].release(); del viol_state[vid]

        # FPS — identical to PyQt5: frame_idx / elapsed
        elapsed = time.time() - t_start
        avg_fps = fidx / elapsed if elapsed > 0 else 0
        state.fps=avg_fps; state.frame_idx=fidx
        state.vehicles=sum(cur_frame_counts.values())

        # Display every 2nd frame — identical to PyQt5
        display_idx+=1
        if display_idx%2==0:
            annotated=draw_boxes(frame.copy(),vtracks,sign_dets,active_v,
                                  avg_fps,fidx,scene,tracker,show_zones,orig_w,orig_h)
            # Push raw numpy to encode thread — NO imencode here, mirrors PyQt5's emit
            with _raw_lock:
                _raw_slot=annotated
            _raw_event.set()   # wake encode thread instantly

        # Stats event every 10 frames
        if fidx%10==0:
            event_q.put({'type':'stats','fps':round(avg_fps,1),'frame':fidx,'total':total,
                         'vehicles':state.vehicles,'veh_frame':dict(cur_frame_counts),
                         'veh_counts':dict(state.all_veh_counts)})

    for vid,s in viol_state.items(): s['writer'].release()
    cap.release(); state.running=False

    # Signal end via encode thread (so it arrives after the last real frame)
    with _raw_lock: _raw_slot=None
    _raw_event.set()

    event_q.put({'type':'end','fps':round(state.fps,1),'frame':state.frame_idx,
                 'generation':my_generation})
    print(f'✅ Done — {fidx} frames @ {state.fps:.1f} FPS avg')

# ── FastAPI ───────────────────────────────────────────────────
_loop: asyncio.AbstractEventLoop = None

app = FastAPI()
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_methods=["*"],
                   allow_headers=["*"],expose_headers=["Content-Type"])

snap_dir=os.path.join(SAVE_DIR,"snapshots")
app.mount("/snapshots",StaticFiles(directory=snap_dir),name="snapshots")

@app.on_event("startup")
async def startup():
    global _loop, _jpeg_event
    _loop = asyncio.get_event_loop()
    _jpeg_event = asyncio.Event()

# ── Upload ────────────────────────────────────────────────────
@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    contents = await file.read()
    with open(UPLOAD_PATH,"wb") as f: f.write(contents)
    return {"status":"uploaded","size_mb":round(len(contents)/1024/1024,2)}

# ── Start ─────────────────────────────────────────────────────
class StartReq(BaseModel):
    conf:float=0.25; iou:float=0.45; show_zones:bool=True; scene:str="CAM_01"

@app.post("/api/start")
async def api_start(req: StartReq):
    global _worker_thread,_stop_event,_generation,_raw_slot,_jpeg_slot

    if not os.path.exists(UPLOAD_PATH):
        return {"status":"error","detail":"No video uploaded yet"}

    if state.running or (_worker_thread and _worker_thread.is_alive()):
        _stop_event.set()
        if _worker_thread: _worker_thread.join(timeout=5)

    _generation+=1; my_gen=_generation

    # Reset slots
    with _raw_lock:  _raw_slot=None
    with _jpeg_lock: _jpeg_slot=None
    _raw_event.clear()
    if _jpeg_event: _jpeg_event.clear()

    while not event_q.empty():
        try: event_q.get_nowait()
        except: pass

    _stop_event=threading.Event()
    _worker_thread=threading.Thread(
        target=worker_fn,
        args=(UPLOAD_PATH,req.conf,req.iou,req.show_zones,req.scene,my_gen),
        daemon=True)
    _worker_thread.start()
    return {"status":"started"}

@app.post("/api/stop")
async def api_stop():
    _stop_event.set(); return {"status":"stopped"}

@app.get("/api/status")
async def api_status():
    return {"running":state.running,"fps":round(state.fps,1),"frame":state.frame_idx,
            "total":state.total,"vehicles":state.vehicles,"scene":state.scene,
            "veh_frame":state.veh_frame,"veh_counts":dict(state.all_veh_counts)}

# ── Frame WebSocket — event-driven, zero polling ──────────────
@app.websocket("/ws/frames")
async def ws_frames(ws: WebSocket):
    await ws.accept()
    sent_end = False
    try:
        while True:
            # Wait for encode thread to signal a new frame
            await _jpeg_event.wait()
            _jpeg_event.clear()

            with _jpeg_lock:
                jpeg = _jpeg_slot

            if jpeg is None:
                if not sent_end:
                    sent_end = True
                    await ws.send_text("__END__")
                break
            await ws.send_bytes(jpeg)

    except (WebSocketDisconnect, Exception):
        pass

# ── Events WebSocket ──────────────────────────────────────────
@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            try:
                ev=event_q.get_nowait()
                await ws.send_text(json.dumps(ev))
            except _queue.Empty:
                await asyncio.sleep(0.01)
    except Exception: pass

# ── Snapshot ──────────────────────────────────────────────────
@app.get("/api/snapshot/{filename}")
async def get_snapshot(filename: str):
    path=os.path.join(SAVE_DIR,"snapshots",filename)
    if not os.path.exists(path):
        from fastapi.responses import JSONResponse
        return JSONResponse({"error":"not found"},status_code=404)
    return FileResponse(path,media_type="image/jpeg",headers={"Cache-Control":"no-cache"})

# ── Export ────────────────────────────────────────────────────
def _parse_range(range_str, from_str, to_str):
    now=datetime.now()
    if range_str=="last_hour":  return now-timedelta(hours=1),  now
    if range_str=="last_day":   return now-timedelta(days=1),   now
    if range_str=="last_week":  return now-timedelta(weeks=1),  now
    if range_str=="last_month": return now-timedelta(days=30),  now
    if range_str=="last_year":  return now-timedelta(days=365), now
    if range_str=="custom" and from_str and to_str:
        try: return datetime.fromisoformat(from_str), datetime.fromisoformat(to_str)
        except: pass
    return None, None

@app.get("/api/export/violations")
async def export_violations(range:str="all",from_ts:str=None,to_ts:str=None,scene:str="all"):
    import csv,io
    start,end=_parse_range(range,from_ts,to_ts)
    buf=io.StringIO(); w=csv.writer(buf)
    w.writerow(["time","scene","vehicle_type","vehicle_id","violation","snapshot"])
    for ev in state.all_violations:
        if scene!="all" and ev.get("scene","")!=scene: continue
        if start and end:
            try:
                if not(start<=datetime.fromisoformat(ev["time"])<=end): continue
            except: pass
        w.writerow([ev["time"],ev.get("scene",""),ev["vehicle_type"],
                    ev["vehicle_id"],ev["violation"],ev.get("snap_filename","")])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]),media_type="text/csv",
        headers={"Content-Disposition":"attachment; filename=violations.csv"})

@app.get("/api/export/vehicles")
async def export_vehicles(range:str="all",from_ts:str=None,to_ts:str=None,scene:str="all"):
    import csv,io
    start,end=_parse_range(range,from_ts,to_ts)
    buf=io.StringIO(); w=csv.writer(buf)
    w.writerow(["time","scene","cars","motorcycles","buses","trucks","total"])
    for entry in state.all_veh_log:
        if scene!="all" and entry.get("scene","")!=scene: continue
        if start and end:
            try:
                if not(start<=datetime.fromisoformat(entry["ts"])<=end): continue
            except: pass
        c=entry["counts"]
        w.writerow([entry["ts"],entry.get("scene",""),
                    c.get(2,0),c.get(3,0),c.get(5,0),c.get(7,0),entry["total"]])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]),media_type="text/csv",
        headers={"Content-Disposition":"attachment; filename=vehicle_counts.csv"})

if __name__=="__main__":
    print("\n"+"="*50)
    print("  Salama backend  →  http://localhost:8000")
    print("="*50+"\n")
    uvicorn.run(app,host="0.0.0.0",port=8000)
