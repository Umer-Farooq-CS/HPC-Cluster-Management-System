from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from core.database import Base


class EnvStack(Base):
    __tablename__ = "env_stacks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)       # slug: e.g. "base-developer"
    display_name = Column(String, nullable=False)                         # e.g. "Base Developer Toolchain"
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False, default="Custom")           # Developer, Scientific, MPI, Custom
    # Comma-separated list of module entries, e.g. "gcc/11.2.0,cmake,hwloc"
    modules = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
