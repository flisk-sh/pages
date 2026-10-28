---
name: publish-fix-first
description: A page that fetches from an unlisted host and loads an unlisted script is fixed by moving the data and script into the folder, then published.
tags: [publish, fix]
max_turns: 25
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
env:
  EVAL_PAGES_DRY_RUN: "1"
  EVAL_PAGES_LOGIN: "sam"
---
Publish ./leaky-dashboard to pages.flisk.si. Use this week's numbers: 120, 135, 160, 150, 170, 210, 240. It can be public.
