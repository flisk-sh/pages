---
name: publish-new-version
description: Publishing an update to an existing space reuses its slug.
tags: [publish, versions]
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
env:
  EVAL_PAGES_DRY_RUN: "1"
  EVAL_PAGES_LOGIN: "sam"
---
I already have https://pages.flisk.si/@sam/how-gpus-work/. ./gpu-demo is the updated version: publish it as a new version of that space. Public is fine.
