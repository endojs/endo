#!/bin/bash
(
  cd docs
  find images -type f | xargs tar c
) |
(
  cd api-docs
  tar xv
)
