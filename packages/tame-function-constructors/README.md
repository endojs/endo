# Tame Function Constructors

## Overview

This module replaces the original `Function` constructor, and the original
`%GeneratorFunction%`, `%AsyncFunction%` and `%AsyncGeneratorFunction%`, with
safe replacements that throw if invoked.

These are all reachable via syntax, so it isn't sufficient to just
replace global properties with safe versions. Our main goal is to prevent
access to the `Function` constructor through these starting points.

After modules block is done, the originals must no longer be reachable, unless
a copy has been made, and funtions can only be created by syntax (using eval)
or by invoking a previously saved reference to the originals.

## Relation to ECMA specifications

The taming of constructors really wants to be part of the standard, because new
constructors may be added in the future, reachable from syntax, and this
list must be updated to match.

In addition, the standard needs to define four new intrinsics for the safe 
replacement functions. See [./whitelist intrinsics].