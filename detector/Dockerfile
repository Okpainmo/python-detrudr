FROM python:3.11-slim

# Prevent Python from buffering logs (important for real-time logs)
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies (iptables + curl for debugging/health)
RUN apt-get update && \
    apt-get install -y iptables curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy project files
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Run your daemon
CMD ["python", "main.py"]