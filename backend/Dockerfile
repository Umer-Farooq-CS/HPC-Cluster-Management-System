FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies (needed for paramiko/asyncssh/psycopg2 if building from source)
RUN apt-get update && apt-get install -y \
    gcc \
    libffi-dev \
    libssl-dev \
    iproute2 \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . /app/

EXPOSE 8000

# Start Uvicorn and run ssh-keyscan to populate known_hosts for the MASTER_IP
CMD ["sh", "-c", "mkdir -p ~/.ssh && ssh-keyscan -H ${MASTER_IP:-192.168.10.2} >> ~/.ssh/known_hosts 2>/dev/null && uvicorn main:app --host 0.0.0.0 --port 8000"]
