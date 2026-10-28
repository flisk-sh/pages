---
name: publish-folder
description: A ready folder is published and the user gets the pages.flisk.si link.
tags: [publish, trigger]
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
env:
  EVAL_PAGES_DRY_RUN: "1"
  EVAL_PAGES_LOGIN: "sam"
---
Put ./gpu-demo online on pages.flisk.si so I can share it. Yes, it can be public.
