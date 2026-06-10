#!/bin/bash
(
  cd docs || exit
  find images -type f -print0 | xargs -0 tar c
) |
(
  cd api-docs || exit
  tar xv
)
