from sqlalchemy import Column, Integer, String
from core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="normal_user") # super_admin, admin, normal_user
    env_profile = Column(String, nullable=True)  # Assigned Lmod metamodule stack name, e.g. "base-developer"
