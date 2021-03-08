/**
 * @fileoverview Agoric-specific plugin
 * @author Agoric
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var requireIndex = require("requireindex");

//------------------------------------------------------------------------------
// Plugin Definition
//------------------------------------------------------------------------------


// import all rules in lib/rules
module.exports.rules = requireIndex(__dirname + "/rules");
module.exports.configs = requireIndex(__dirname + "/configs");
module.exports.processors = requireIndex(__dirname + "/processors");
