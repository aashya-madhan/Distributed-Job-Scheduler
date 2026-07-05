# 🚀 Distributed Job Scheduler

A full-stack distributed job scheduling platform that enables users to create, schedule, monitor, and manage background jobs in real time. The system supports queue management, worker-based job execution, cron scheduling, project organization, authentication, live metrics, and WebSocket updates through an intuitive dashboard.

---

## 📌 Features

- 🔐 JWT-based User Authentication
- 📁 Project Management
- 📋 Job Creation and Scheduling
- ⏰ Cron-based Scheduled Jobs
- ⚡ Distributed Worker Processing
- 📦 Queue Management
- 📊 Real-time Dashboard Metrics
- 📈 Job Status Monitoring
- 🔄 Live Updates using WebSockets
- 📝 Execution Logs
- 🛡️ Input Validation & Error Handling
- 📱 Responsive Modern UI

---

## 🛠️ Tech Stack

### Frontend
- React
- TypeScript
- Vite
- React Router
- React Query
- Axios
- Tailwind CSS
- Recharts
- React Hot Toast

### Backend
- Node.js
- Express.js
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT Authentication
- WebSockets
- Winston Logger
- Node Cron

---

## 📂 Project Structure

```
Distributed-Job-Scheduler/
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── backend/
│   ├── prisma/
│   ├── src/
│   ├── package.json
│   └── .env.example
│
└── README.md
```

---

## ⚙️ Installation

### Clone Repository

```bash
git clone https://github.com/aashya-madhan/Distributed-Job-Scheduler.git

cd Distributed-Job-Scheduler
```

---

## Backend Setup

```bash
cd backend

npm install
```

Create a `.env` file from `.env.example`

Generate Prisma Client

```bash
npm run db:generate
```

Run Database Migration

```bash
npm run db:migrate
```

Start Backend

```bash
npm run dev
```

---

## Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

Frontend runs on

```
http://localhost:5173
```

Backend runs on

```
http://localhost:5000
```

---

## 📊 Core Modules

- Authentication
- Dashboard
- Projects
- Job Scheduler
- Queue Management
- Worker Service
- Metrics Dashboard
- Real-time Notifications
- WebSocket Service

---

## 🗄️ Database

The project uses **PostgreSQL** with **Prisma ORM**.

Main entities include:

- Users
- Projects
- Jobs
- Queues
- Job Executions

---

## 🔄 Scheduler Workflow

1. User creates a project.
2. Jobs are added to a queue.
3. Scheduler assigns pending jobs.
4. Workers execute jobs.
5. Job status is updated.
6. Dashboard receives live updates via WebSockets.
7. Metrics and logs are stored for monitoring.

---

## 📸 Screenshots

Add screenshots of:

- Login Page
- Dashboard
- Projects
- Job Scheduler
- Queue Management
- Metrics Dashboard
- Job Details

Example:

```
screenshots/
    dashboard.png
    jobs.png
    queues.png
```

---

## 📈 Future Enhancements

- Docker Deployment
- Kubernetes Support
- Redis Queue
- RabbitMQ Integration
- Email Notifications
- Role-Based Access Control
- Auto Scaling Workers
- Retry Policies
- REST API Documentation
- CI/CD Pipeline

---

## 🧪 Testing

Backend includes automated tests.

Run:

```bash
npm test
```

Coverage:

```bash
npm run test:coverage
```

---

## 👨‍💻 Author

**Aashya Madhan**

GitHub:
https://github.com/aashya-madhan

