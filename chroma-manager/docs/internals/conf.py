#
# ========================================================
# Copyright (c) 2012 Whamcloud, Inc.  All rights reserved.
# ========================================================


import sys
import os

project_dir = None
pwd_parts = os.environ['PWD'].split(os.sep)
while not project_dir:
    settings_path = "/" + os.path.join(*(pwd_parts + ["settings.py"]))
    if os.path.exists(settings_path):
        project_dir = "/" + os.path.join(*pwd_parts)
    else:
        pwd_parts = pwd_parts[0:-1]
        if len(pwd_parts) == 0:
            raise RuntimeError("Can't find settings.py")

sys.path.append(project_dir)

agent_dir = os.path.join(*(list(os.path.split(project_dir)[0:-1]) + ['chroma-agent']))
sys.path.append(agent_dir)

from docs.conf_common import *

project = u'Chroma Internals'
master_doc = 'index'

graphviz_dot_args = [
        "-Nfontname=Arial", "-Nfontsize=10", "-Nshape=box",
        "-Efontname=Arial", "-Efontsize=10"
]

extensions.append('sphinx.ext.viewcode')
extensions.append('sphinx.ext.graphviz')
