import Lake
open Lake DSL

require veil from git "https://github.com/verse-lab/veil.git" @ "main"

package OcapnFlush where

@[default_target]
lean_lib OcapnFlush where
