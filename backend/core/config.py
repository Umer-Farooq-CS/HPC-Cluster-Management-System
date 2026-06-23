from pydantic_settings import BaseSettings
import os
from typing import List

class Settings(BaseSettings):
    # API Settings
    API_TITLE: str = "HPC Cluster Management API"
    API_VERSION: str = "1.0.0"
    
    # Domain configuration
    DOMAIN: str = "192.168.10.100"
    
    # Master Node SSH Credentials
    MASTER_IP: str = "192.168.10.2"
    MASTER_USER: str = "root"
    MASTER_PASS: str = "hpc"
    
    # Cluster Network Configuration
    DATA_IP: str = "192.168.30.1"
    PROV_NETWORK: str = "192.168.20.0"
    PROV_IP: str = "192.168.20.1"
    
    @property
    def FRONTEND_URLS(self) -> List[str]:
        # This dynamically supports the exact Domain loaded from the .env file!
        return [
            f"http://{self.DOMAIN}:5173",
            f"http://{self.DOMAIN}",
            f"https://{self.DOMAIN}",
            "http://localhost:5173",
            "http://localhost"
        ]

    class Config:
        env_file = "../.env" # Assuming backend is in /backend but run via Docker at project root

settings = Settings()
