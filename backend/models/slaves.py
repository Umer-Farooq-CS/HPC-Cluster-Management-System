from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from core.database import Base

class ComputeNodeDB(Base):
    __tablename__ = "compute_nodes"

    id = Column(String, primary_key=True, index=True) # Usually the hostname or mac
    hostname = Column(String, unique=True, index=True, nullable=False)
    mac = Column(String, unique=True, index=True, nullable=False)
    ip = Column(String, nullable=False)
    assignedImage = Column(String, nullable=True)
    sockets = Column(Integer, default=1)
    coresPerSocket = Column(Integer, default=4)
    threadsPerCore = Column(Integer, default=1)

class ClusterGroupDB(Base):
    __tablename__ = "cluster_groups"

    name = Column(String, primary_key=True, index=True)
    members = Column(String, nullable=False)
    autoSync = Column(Boolean, default=False)
