#!/usr/bin/env python3

import os, sys, re
from subprocess import Popen, PIPE

def run_command(cmd):
    p = Popen(cmd, stdout=PIPE)
    (stdout, _) = p.communicate()
    rc = p.returncode
    if rc != 0:
        print("cmd failed (rc=%d)" % rc)
        print("cmd:", cmd)
        print("stdout:", stdout)
    return stdout

remotes = sys.argv[1:]
for remote in remotes:
    lines = run_command(["git", "ls-remote", remote]).decode("utf-8")
    for line in lines.splitlines():
        commit_id, name = line.split("\t")
        if name.endswith("{}"):
            continue
        if not name.startswith("refs/tags/"):
            continue
        name = name[len("refs/tags/"):]
        mo = re.search(r"-dev\.\d+$", name)
        if mo:
            # ignore e.g. "v0.1.11-dev.0"
            continue
        mo = re.search(r"^\d+\.\d+\.\d+$", name)
        if mo:
            name = "v" + name
        mo = re.search(r"^v\d+\.\d+\.\d+$", name)
        if not mo:
            print("-- odd:", remote, name)
            continue
        new_name = "%s-%s" % (remote, name)
        print(new_name, commit_id)
        run_command(["git", "tag", new_name, commit_id])


