import subprocess
import re

out = """/export/apps/custom_modules:
base-developer
core-scripting
data-utilities
/export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core:
autoconf/
autoconf/2.72-mx5bzw7
automake/
automake/1.18.1-gdqknft"""

modules = []
for line in out.splitlines():
    line = line.strip()
    if not line:
        continue
    if line.endswith(":") or line.endswith("/"):
        continue
    modules.append(line)

print(sorted(set(modules)))
