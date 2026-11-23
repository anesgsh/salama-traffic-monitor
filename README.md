# Salama — Traffic Monitoring System

A video-based traffic monitoring prototype that uses lightweight deep learning for traffic sign detection, vehicle detection, and traffic violation monitoring.

## Overview

Salama combines an optimized deep learning model with a web-based monitoring interface to detect traffic signs and vehicles, monitor potential violations, and visualize detection events.

The system is designed with edge deployment and computational efficiency in mind, using OpenVINO INT8 inference.

## Features

- Traffic sign and vehicle detection
- Stop-sign and traffic restriction violation monitoring
- Vehicle tracking and violation event generation
- Detection visualization through WebSockets
- Dashboard, detection history, and analytics
- OpenVINO INT8 optimized inference

## Architecture

- **Frontend:** React, TypeScript, Vite, and Tailwind CSS
- **Backend:** Python, FastAPI, and WebSockets
- **Inference:** OpenVINO with an INT8 optimized model
- **Computer vision:** OpenCV and NumPy

## Project Structure

```text
salama-traffic-monitor/
├── frontend/
├── model/
│   ├── merged_traffic_model_int8_ov.xml
│   └── merged_traffic_model_int8_ov.bin
├── requirements.txt
├── salama_backend.py
├── README.md
└── .gitignore
```

## Requirements

- Python 3.12
- Node.js and npm
- Git

## Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/anesgsh/salama-traffic-monitor.git
cd salama-traffic-monitor
```

### 2. Set up the backend

Create and activate a virtual environment:

**Windows PowerShell:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Start the backend:

```powershell
python salama_backend.py
```

The backend runs locally at `http://localhost:8000`.

### 3. Set up the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite.

## Model

The project includes an OpenVINO INT8 optimized model:

- `merged_traffic_model_int8_ov.xml`
- `merged_traffic_model_int8_ov.bin`

## Current Limitations

- The current prototype processes prerecorded video rather than live CCTV streams.
- Authentication is demonstration-only and is not suitable for production security.
- Integration with actual traffic surveillance infrastructure requires further development.

## License

No license has been assigned. All rights reserved.