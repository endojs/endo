// @ts-check
/* global window, document, requestAnimationFrame, Intl, navigator, setTimeout */
/* eslint-disable no-continue */

import { E } from '@endo/far';
import { passStyleOf } from '@endo/pass-style';
import { makeRefIterator } from './ref-iterator.js';
import { sendFormComponent } from './send-form.js';
import { commandSelectorComponent } from './command-selector.js';
import { createEvalForm } from './eval-form.js';
import { createInlineCommandForm } from './inline-command-form.js';
import { createCommandExecutor } from './command-executor.js';
import {
  getCommand,
  getCategories,
  getCommandsByCategory,
} from './command-registry.js';
import { createMessagePicker } from './message-picker.js';
import { createHelpModal } from './help-modal.js';
import {
  prepareTextWithPlaceholders,
  renderMarkdown,
} from './markdown-render.js';

const template = `
<style>

  :root {
    /* Colors - Light theme inspired by modern chat apps */
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;
    --bg-sidebar: #f1f3f5;
    --bg-hover: #e9ecef;
    --bg-active: #dee2e6;
    
    --text-primary: #212529;
    --text-secondary: #495057;
    --text-muted: #868e96;
    
    --accent-primary: #228be6;
    --accent-hover: #1c7ed6;
    --accent-light: #e7f5ff;
    
    --border-color: #dee2e6;
    --border-light: #e9ecef;
    
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
    --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);
    
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    
    --transition-fast: 150ms ease;
    --transition-normal: 200ms ease;
    
    --sidebar-width: 280px;
  }

  * {
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    color: var(--text-primary);
    background: var(--bg-primary);
    height: 100vh;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }

  /* Sidebar - Inventory */
  #pets {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar-width);
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-color);
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Resize handle */
  #resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--sidebar-width);
    width: 6px;
    margin-left: -3px;
    cursor: col-resize;
    background: transparent;
    z-index: 50;
    transition: background var(--transition-fast);
  }

  #resize-handle:hover,
  #resize-handle.dragging {
    background: var(--accent-primary);
  }

  /* Profile breadcrumbs */
  #profile-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8px 12px;
    background: var(--bg-hover);
    border-top: 1px solid var(--border-color);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    white-space: nowrap;
  }

  #profile-bar:empty {
    display: none;
  }

  .profile-breadcrumb {
    color: var(--accent-primary);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  .profile-breadcrumb:hover {
    background: var(--bg-active);
  }

  .profile-breadcrumb.current {
    color: var(--text-primary);
    cursor: default;
    font-weight: 500;
  }

  .profile-breadcrumb.current:hover {
    background: transparent;
  }

  .profile-separator {
    color: var(--text-muted);
    font-size: 10px;
  }

  /* Adjust pets list for profile bar */
  #pets {
    padding-bottom: 40px;
  }

  body.resizing {
    cursor: col-resize;
    user-select: none;
  }

  body.resizing * {
    cursor: col-resize !important;
  }

  #pets::before {
    content: 'Inventory';
    display: block;
    padding: 20px 16px 12px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }

  .pet-list {
    display: flex;
    flex-direction: column;
    padding: 0 8px 8px;
    gap: 2px;
  }

  .pet-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    font-size: 14px;
    color: var(--text-primary);
    transition: background var(--transition-fast);
    gap: 8px;
  }

  .pet-item:hover {
    background: var(--bg-hover);
  }

  .pet-item button {
    opacity: 0;
    padding: 4px 8px;
    font-size: 12px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--bg-active);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .pet-item:hover button {
    opacity: 1;
  }

  .pet-item button:hover {
    background: var(--accent-primary);
    color: white;
  }

  .pet-item .enter-button {
    background: var(--accent-light);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
  }

  .pet-item .enter-button:hover {
    background: var(--accent-primary);
    color: white;
  }

  .pet-buttons {
    display: flex;
    gap: 4px;
  }

  .pet-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Main content - Messages */
  #messages {
    position: absolute;
    top: 0;
    left: var(--sidebar-width);
    right: 0;
    bottom: 60px;
    padding: 20px 24px;
    padding-top: calc(100vh - 160px);
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--bg-primary);
  }

  /* Chat input bar */
  #chat-bar {
    position: absolute;
    left: var(--sidebar-width);
    right: 0;
    bottom: 0;
    height: auto;
    min-height: 60px;
    padding: 12px 24px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .command-row {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: 12px;
    width: 100%;
  }

  #chat-modeline {
    display: none;
    font-size: 11px;
    color: var(--text-muted);
    padding-top: 4px;
  }

  #chat-modeline kbd {
    display: inline-block;
    padding: 2px 5px;
    font-size: 10px;
    font-family: inherit;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    margin-right: 4px;
  }

  #chat-modeline .modeline-hint {
    margin-right: 16px;
  }

  #chat-bar.has-modeline #chat-modeline {
    display: block;
  }

  #chat-bar #chat-message {
    flex: 1;
    min-width: 0;
  }

  #chat-bar button {
    flex-shrink: 0;
  }

  #chat-input-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  #chat-error {
    display: none;
    position: absolute;
    left: 0;
    bottom: 100%;
    margin-bottom: 6px;
    padding: 6px 10px;
    background: #c92a2a;
    color: #ffffff;
    font-size: 12px;
    border-radius: var(--radius-md);
    white-space: nowrap;
    z-index: 10;
    box-shadow: var(--shadow-md);
  }

  #chat-error:not(:empty) {
    display: block;
  }

  #chat-error::after {
    content: '';
    position: absolute;
    left: 16px;
    top: 100%;
    border: 6px solid transparent;
    border-top-color: #c92a2a;
  }

  #chat-input-wrapper:has(#chat-error:not(:empty)) #chat-message {
    border-color: #e03131;
  }

  #chat-input-wrapper #chat-message {
    width: 100%;
    min-height: 38px;
    padding: 8px 12px;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.4;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
    overflow-x: hidden;
    overflow-y: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  #chat-input-wrapper #chat-message:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  #chat-input-wrapper #chat-message:empty::before {
    content: attr(data-placeholder);
    color: var(--text-muted);
    pointer-events: none;
  }

  /* Token styling in contenteditable */
  .chat-token {
    display: inline-block;
    padding: 1px 6px;
    margin: 0 1px;
    background: var(--accent-light);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
    border-radius: var(--radius-sm);
    font-weight: 500;
    font-size: 13px;
    line-height: 1.4;
    white-space: nowrap;
    user-select: all;
  }

  .chat-token::before {
    content: '@';
    opacity: 0.7;
  }

  .chat-token .token-edge {
    opacity: 0.7;
  }

  .chat-token .token-edge::before {
    content: ':';
  }

  /* Token autocomplete menu */
  .token-menu {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    max-height: 200px;
    overflow-y: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    margin-bottom: 4px;
    z-index: 200;
  }

  .token-menu.visible {
    display: block;
  }

  .token-menu-item {
    padding: 8px 12px;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .token-menu-item:hover,
  .token-menu-item.selected {
    background: var(--accent-light);
  }

  .token-menu-item.selected {
    background: var(--accent-primary);
    color: white;
  }

  .token-menu-item .token-prefix {
    color: var(--accent-primary);
    font-weight: 500;
  }

  .token-menu-item.selected .token-prefix {
    color: white;
  }

  .token-menu-empty {
    padding: 12px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }

  .token-menu-hint {
    padding: 8px 12px;
    border-top: 1px solid var(--border-light);
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-secondary);
  }

  .token-menu-hint kbd {
    display: inline-block;
    padding: 2px 5px;
    font-size: 10px;
    font-family: inherit;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    margin: 0 2px;
  }

  .command-desc {
    color: var(--text-muted);
    font-size: 12px;
    margin-left: 4px;
  }

  .token-menu-item.selected .command-desc {
    color: rgba(255, 255, 255, 0.8);
  }

  /* Eval Form Styles */
  #eval-form-container {
    display: none;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    z-index: 1000;
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: visible;
  }

  #eval-form-backdrop {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
  }

  .eval-form {
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .eval-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .eval-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
  }

  .eval-close {
    background: none;
    border: none;
    font-size: 20px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .eval-close:hover {
    color: var(--text-primary);
  }

  .eval-editor-container {
    height: 300px;
    border-bottom: 1px solid var(--border-light);
    position: relative;
    overflow: hidden;
  }

  .eval-editor-container iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  .eval-endowments {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
  }

  .eval-endowments-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .eval-add-endowment {
    margin-top: 8px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .eval-add-endowment:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .eval-endowments-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 150px;
    overflow-y: auto;
  }

  .eval-endowment-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .eval-codename {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .eval-codename:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .eval-arrow {
    color: var(--text-muted);
    font-size: 14px;
  }

  .eval-petname-wrapper {
    flex: 1;
    position: relative;
  }

  .eval-petname {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 13px;
    box-sizing: border-box;
  }

  .eval-petname:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .eval-petname-menu {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 300;
    max-height: 200px;
    overflow-y: auto;
  }

  .eval-petname-menu.visible {
    display: block;
  }

  .eval-petname-menu .token-menu-item {
    padding: 8px 12px;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-primary);
  }

  .eval-petname-menu .token-menu-item:hover,
  .eval-petname-menu .token-menu-item.selected {
    background: var(--accent-primary);
    color: white;
  }

  .eval-petname-menu .token-menu-empty {
    padding: 12px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }

  .eval-petname-menu .token-menu-hint {
    padding: 8px 12px;
    border-top: 1px solid var(--border-light);
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-secondary);
  }

  .eval-petname-menu .token-menu-hint kbd {
    display: inline-block;
    padding: 2px 5px;
    font-size: 10px;
    font-family: inherit;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
  }

  .eval-remove-endowment {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
    padding: 4px;
    line-height: 1;
  }

  .eval-remove-endowment:hover {
    color: #e53e3e;
  }

  .eval-options {
    display: flex;
    gap: 16px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
  }

  .eval-option {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .eval-option label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .eval-option input {
    padding: 6px 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 13px;
  }

  .eval-option input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .eval-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--bg-secondary);
  }

  .eval-error {
    color: #e53e3e;
    font-size: 13px;
  }

  .eval-submit {
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .eval-submit:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .eval-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  #anchor {
    height: 20px;
  }

  /* Inline Command Form Styles */
  .inline-command-form {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    align-items: center;
    flex: 1;
  }

  .inline-field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .inline-field-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .inline-field-input-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .inline-field-input {
    width: 100%;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }

  .inline-field-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-light);
  }

  .inline-field-input::placeholder {
    color: var(--text-muted);
  }

  .message-number-input {
    width: 80px;
    min-width: 80px;
    flex: 0 0 auto;
  }

  .inline-petname-menu {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin-bottom: 4px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 300;
    max-height: 200px;
    overflow-y: auto;
  }

  .inline-petname-menu.visible {
    display: block;
  }

  /* Command bar modes */
  #chat-bar.command-mode #chat-input-wrapper {
    display: none;
  }

  #chat-bar.command-mode .command-header {
    display: flex;
    align-items: baseline;
    flex-shrink: 0;
  }

  .command-header {
    display: none;
  }

  .command-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent-primary);
  }

  /* Hide cancel button from header - it moves to footer in command mode */
  #chat-bar.command-mode .command-header .command-cancel {
    display: none;
  }

  .command-cancel {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    padding: 2px 6px;
    line-height: 1;
  }

  .command-cancel:hover {
    color: var(--text-primary);
  }

  #inline-form-container {
    display: none;
    flex: 1;
    min-width: 0;
  }

  #chat-bar.command-mode #inline-form-container {
    display: flex;
  }

  #chat-bar.command-mode .command-footer {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-shrink: 0;
  }

  .command-footer {
    display: none;
  }

  .command-cancel-footer {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .command-cancel-footer:hover {
    color: var(--text-primary);
  }

  #command-error {
    display: none;
    position: absolute;
    left: 0;
    bottom: 100%;
    margin-bottom: 6px;
    padding: 6px 10px;
    background: #c92a2a;
    color: #ffffff;
    font-size: 12px;
    border-radius: var(--radius-md);
    white-space: nowrap;
    z-index: 10;
    box-shadow: var(--shadow-md);
  }

  #command-error:not(:empty) {
    display: block;
  }

  #command-error::after {
    content: '';
    position: absolute;
    left: 16px;
    top: 100%;
    border: 6px solid transparent;
    border-top-color: #c92a2a;
  }

  #chat-bar.command-mode #chat-send-button {
    display: none;
  }

  #chat-bar.command-mode #chat-button-wrapper {
    display: none;
  }

  /* Inline Eval Styles */
  .inline-eval-container {
    flex: 1;
    min-width: 0;
  }

  .inline-eval-wrapper {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
  }

  .inline-eval-endowments {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-shrink: 0;
  }

  .inline-eval-endowment-group {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    white-space: nowrap;
  }

  .inline-eval-chip {
    display: inline-flex;
    align-items: baseline;
    padding: 1px 6px;
    background: var(--accent-light);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
    border-radius: var(--radius-sm);
    font-weight: 500;
    font-size: 13px;
    line-height: 1.4;
  }

  .inline-eval-chip::before {
    content: '@';
    opacity: 0.7;
  }

  .inline-eval-petname-wrapper,
  .inline-eval-codename-wrapper {
    position: relative;
    display: inline-block;
  }

  .inline-eval-petname-wrapper .inline-petname-menu {
    left: -12px;
    min-width: 150px;
  }

  .inline-eval-petname {
    border: none;
    background: transparent;
    font-size: 13px;
    font-weight: 500;
    color: var(--accent-primary);
    outline: none;
    padding: 0;
    margin: 0;
    min-width: 20px;
  }

  .inline-eval-arrow {
    color: var(--text-muted);
    font-size: 12px;
  }

  .inline-eval-codename {
    border: none;
    background: transparent;
    font-size: 13px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-weight: 400;
    color: var(--text-primary);
    outline: none;
    padding: 0;
    margin: 0;
    min-width: 20px;
  }

  .inline-eval-petname::placeholder {
    color: var(--accent-primary);
    opacity: 0.5;
  }

  .inline-eval-codename::placeholder {
    color: var(--text-muted);
    opacity: 0.7;
  }

  .inline-eval-sizer {
    position: absolute;
    visibility: hidden;
    white-space: pre;
    padding: 0;
  }

  .inline-eval-sizer-petname {
    font-size: 13px;
    font-weight: 500;
  }

  .inline-eval-sizer-codename {
    font-size: 13px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-weight: 400;
  }

  .inline-eval-input {
    flex: 1;
    min-width: 100px;
    padding: 8px 12px;
    font-size: 14px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }

  .inline-eval-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  .inline-eval-input::placeholder {
    color: var(--text-muted);
    font-family: inherit;
  }

  .inline-eval-menu {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin-bottom: 4px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 300;
    max-height: 200px;
    overflow-y: auto;
  }

  .inline-eval-menu.visible {
    display: block;
  }

  /* Message number highlighting */
  .message.highlighted {
    box-shadow: 0 0 0 2px var(--accent-primary);
    background: var(--accent-light);
  }

  .message .message-num-badge {
    display: none;
    position: absolute;
    top: -6px;
    left: -6px;
    background: #000000;
    color: #ffffff;
    font-size: 14px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    z-index: 5;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .message.highlighted .message-num-badge {
    display: block;
  }

  /* Message picking mode */
  .message-picking-mode .message.selectable {
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .message-picking-mode .message.selectable:hover {
    box-shadow: 0 0 0 2px var(--accent-primary);
    background: var(--accent-light);
  }

  .message-picking-mode .message.selectable .message-num-badge {
    display: block;
    opacity: 0.7;
  }

  .message-picking-mode .message.selectable:hover .message-num-badge {
    opacity: 1;
  }

  .message-picking-mode .message.selectable.highlighted .message-num-badge {
    opacity: 1;
    background: #37b24d;
  }

  .message {
    display: flex;
    flex-direction: row;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 8px;
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-light);
    transition: box-shadow var(--transition-fast);
  }

  .message-body {
    flex: 1;
    min-width: 0;
  }

  .message:hover {
    box-shadow: var(--shadow-sm);
  }

  .message.sent {
    background: #3b82f6;
    color: #ffffff;
    border-color: #2563eb;
  }

  .message.sent strong {
    color: #ffffff;
  }

  .message.sent .timestamp {
    color: rgba(255, 255, 255, 0.7);
  }

  .message.sent b {
    background: #dbe4ff;
    color: #1a1a1a;
    font-weight: 500;
  }

  .message strong {
    color: var(--accent-primary);
    font-weight: 600;
  }

  .timestamp {
    position: relative;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-muted);
    cursor: default;
  }

  .timestamp-tooltip {
    display: none;
    position: absolute;
    left: 0;
    top: 0;
    padding: 8px 12px;
    background: #2d3748;
    color: #f7fafc;
    border-radius: var(--radius-md);
    font-size: 12px;
    font-family: var(--font-mono);
    line-height: 1.5;
    z-index: 10;
    box-shadow: var(--shadow-md);
    flex-direction: row;
    gap: 12px;
  }

  .timestamp:hover .timestamp-tooltip {
    display: flex;
  }

  .timestamp-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .timestamp-num {
    color: var(--text-muted);
  }

  .timestamp-times {
    display: flex;
    flex-direction: column;
    white-space: nowrap;
  }

  .timestamp-line {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    margin: -2px -4px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .timestamp-line:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .timestamp-copy {
    opacity: 0;
    font-size: 10px;
    transition: opacity 0.15s;
  }

  .timestamp-line:hover .timestamp-copy {
    opacity: 0.7;
  }

  .timestamp-copy:hover {
    opacity: 1;
  }

  .dismiss-button {
    padding: 4px 8px;
    font-size: 14px;
    line-height: 1;
    background: transparent;
    color: #e53e3e;
    border: 1px solid #e53e3e;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .dismiss-button:hover {
    background: #e53e3e;
    color: #ffffff;
  }

  .message b {
    background: #3b82f6;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-weight: 500;
  }

  /* Markdown rendering styles */
  .md-paragraph {
    margin: 0 0 8px;
  }

  .md-paragraph:last-child {
    margin-bottom: 0;
  }

  .md-heading {
    margin: 12px 0 6px;
    font-weight: 600;
    line-height: 1.3;
  }

  .md-heading:first-child {
    margin-top: 0;
  }

  .md-h1 { font-size: 1.5em; }
  .md-h2 { font-size: 1.3em; }
  .md-h3 { font-size: 1.15em; }
  .md-h4 { font-size: 1.05em; }
  .md-h5 { font-size: 1em; }
  .md-h6 { font-size: 0.95em; color: var(--text-secondary); }

  .md-list {
    margin: 8px 0;
    padding-left: 24px;
  }

  .md-list:last-child {
    margin-bottom: 0;
  }

  .md-list-item {
    margin: 4px 0;
  }

  .message .inline-code {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.9em;
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 4px;
  }

  .message.sent .inline-code {
    background: rgba(255, 255, 255, 0.2);
  }

  .md-code-fence {
    margin: 12px 0;
    padding: 12px 16px;
    background: #e9ecef;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow-x: auto;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    line-height: 1.5;
    position: relative;
  }

  .md-code-fence-language {
    position: absolute;
    top: 0;
    right: 0;
    padding: 2px 8px;
    font-size: 11px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border-bottom-left-radius: var(--radius-sm);
    border-top-right-radius: var(--radius-md);
    text-transform: lowercase;
  }

  .message.sent .md-code-fence-language {
    color: var(--text-muted);
    background: rgba(0, 0, 0, 0.08);
  }

  .md-code-fence code {
    color: #24292f;
    white-space: pre;
    display: block;
  }

  .message.sent .md-code-fence {
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(255, 255, 255, 0.5);
  }

  .message.sent .md-code-fence code {
    color: #24292f;
  }

  /* Code syntax highlighting - light mode */
  .code-keyword {
    color: #cf222e;
    font-weight: 500;
  }

  .code-string {
    color: #0a3069;
  }

  .code-comment {
    color: #6e7781;
    font-style: italic;
  }

  .code-number {
    color: #0550ae;
  }

  /* Syntax highlighting for sent messages - use same light mode colors */
  .message.sent .md-code-fence .code-keyword {
    color: #cf222e;
  }

  .message.sent .md-code-fence .code-string {
    color: #0a3069;
  }

  .message.sent .md-code-fence .code-comment {
    color: #6e7781;
  }

  .message.sent .md-code-fence .code-number {
    color: #0550ae;
  }

  /* Markdown chip slot (invisible, just holds position) */
  .md-chip-slot {
    display: inline;
  }

  /* Message body markdown overrides */
  .message-body strong {
    font-weight: 600;
  }

  .message-body em {
    font-style: italic;
  }

  .message-body s {
    text-decoration: line-through;
    opacity: 0.7;
  }

  .message.sent .message-body strong {
    color: inherit;
  }

  .token {
    position: relative;
    display: inline-block;
  }

  .token b {
    cursor: pointer;
  }

  .token-popup {
    display: none;
    position: absolute;
    left: 0;
    top: 100%;
    padding: 8px;
    padding-top: 12px;
    background: #2d3748;
    border-radius: var(--radius-md);
    z-index: 10;
    box-shadow: var(--shadow-md);
    white-space: nowrap;
    gap: 6px;
  }

  .token-popup::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -8px;
    height: 8px;
  }

  .token:hover .token-popup {
    display: flex;
  }

  .token-popup input {
    padding: 6px 8px;
    font-size: 12px;
    width: 120px;
  }

  .token-popup button {
    padding: 6px 10px;
    font-size: 12px;
  }

  /* Form elements */
  input, textarea, select {
    font-family: inherit;
    font-size: 14px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    transition: all var(--transition-fast);
    outline: none;
  }

  input:focus, textarea:focus, select:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  input.big {
    font-size: 16px;
    padding: 12px 14px;
  }

  input.half-wide {
    width: 120px;
  }

  select {
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23495057' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 32px;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
  }

  button {
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    padding: 10px 16px;
    border: none;
    border-radius: var(--radius-md);
    background: var(--accent-primary);
    color: white;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  button:hover {
    background: var(--accent-hover);
  }

  button:active {
    transform: scale(0.98);
  }

  .message button {
    font-size: 12px;
    padding: 6px 12px;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .message button:hover {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  .message input {
    font-size: 13px;
    padding: 6px 10px;
    margin: 0 4px;
  }

  .message select {
    font-size: 13px;
    padding: 6px 28px 6px 10px;
  }

  .definition-slots {
    margin: 8px 0;
  }

  .definition-slot-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
    flex-wrap: wrap;
  }

  .definition-slot-row label {
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    min-width: 80px;
  }

  .slot-description {
    color: var(--text-muted);
    font-size: 12px;
    flex: 1;
    min-width: 100px;
  }

  .slot-binding-input {
    font-size: 13px;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    width: 140px;
  }

  /* Modal frames */
  .frame {
    display: none;
    position: fixed;
    inset: 0;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    z-index: 200;
  }

  .frame[data-show=true] {
    display: flex;
  }

  .window {
    background: var(--bg-primary);
    padding: 24px;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    max-height: calc(100vh - 80px);
    max-width: calc(100vw - 80px);
    min-width: 400px;
    overflow: auto;
  }

  .window p {
    margin: 0 0 16px;
  }

  .window label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  #value-value {
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 14px;
    max-width: 600px;
    overflow-x: auto;
  }

  /* Value rendering */
  .string {
    white-space: pre-wrap;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    word-break: break-word;
    color: #c92a2a;
  }

  .number {
    color: #5c7cfa;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }

  .bigint {
    color: #37b24d;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }

  .remotable, .tag {
    font-style: italic;
    color: var(--accent-primary);
  }

  .error {
    color: #e03131;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    padding: 8px 12px;
    background: #fff5f5;
    border-radius: var(--radius-sm);
    border: 1px solid #ffc9c9;
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  /* Help Modal Styles */
  #help-modal-container {
    display: none;
    position: fixed;
    inset: 0;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    z-index: 1000;
  }

  .help-modal {
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    max-width: 700px;
    width: 90%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
  }

  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-light);
  }

  .help-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .help-close {
    background: none;
    border: none;
    font-size: 24px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .help-close:hover {
    color: var(--text-primary);
  }

  .help-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .help-intro {
    margin-bottom: 16px;
    padding: 12px 16px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    font-size: 14px;
    color: var(--text-secondary);
  }

  .help-intro p {
    margin: 0;
  }

  .help-intro kbd {
    display: inline-block;
    padding: 2px 6px;
    font-size: 12px;
    font-family: inherit;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    margin: 0 2px;
  }

  .help-category {
    margin-bottom: 20px;
  }

  .help-category-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }

  .help-commands {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .help-command {
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .help-command:hover {
    background: var(--bg-hover);
  }

  .help-command.expanded {
    background: var(--bg-hover);
  }

  .help-command-header {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    gap: 10px;
  }

  .help-command-name {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent-primary);
    min-width: 100px;
  }

  .help-command-desc {
    flex: 1;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .help-command-toggle {
    font-size: 16px;
    color: var(--text-muted);
    width: 20px;
    text-align: center;
  }

  .help-command-details {
    padding: 0 14px 14px;
    border-top: 1px solid var(--border-light);
    margin-top: 4px;
    padding-top: 12px;
  }

  .help-usage {
    margin-bottom: 10px;
  }

  .help-usage code {
    display: block;
    padding: 8px 12px;
    background: var(--bg-primary);
    border-radius: var(--radius-sm);
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    color: var(--text-primary);
  }

  .help-examples {
    margin-bottom: 10px;
  }

  .help-examples strong {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .help-examples code {
    display: block;
    padding: 6px 10px;
    margin-bottom: 4px;
    background: var(--bg-primary);
    border-radius: var(--radius-sm);
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .help-notes {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .help-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border-light);
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
  }

  .help-footer kbd {
    display: inline-block;
    padding: 2px 6px;
    font-size: 11px;
    font-family: inherit;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
  }

  /* Value Modal Actions Row */
  .value-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-light);
  }

  .value-save-form {
    display: flex;
    gap: 8px;
    align-items: center;
    flex: 1;
  }

  .value-save-form label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .value-save-form input {
    flex: 1;
    min-width: 120px;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }

  .value-save-form input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  .value-save-form button {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
  }

  .value-actions > button {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .value-actions > button:hover {
    background: var(--bg-hover);
  }

  /* Hamburger Menu Button */
  #chat-menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  #chat-menu-button:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
  }

  #chat-menu-button svg {
    width: 18px;
    height: 18px;
    stroke: var(--text-secondary);
  }

  #chat-menu-button:hover svg {
    stroke: var(--accent-primary);
  }

  /* Hide send button by default, show when has content */
  #chat-send-button {
    display: none;
  }

  #chat-bar.has-content #chat-send-button {
    display: block;
  }

  #chat-bar.has-content #chat-menu-button,
  #chat-bar.command-mode #chat-menu-button {
    display: none;
  }

  /* Cat menu (attached to cat button) */
  #chat-command-popover {
    display: none;
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 8px;
    min-width: 200px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 300;
    max-height: 400px;
    overflow-y: auto;
  }

  /* Wider cat menu on desktop */
  @media (min-width: 768px) {
    #chat-command-popover {
      min-width: 400px;
    }
  }

  #chat-command-popover.visible {
    display: block;
  }

  .command-popover-header {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-light);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }

  .command-popover-section {
    padding: 6px 0;
    border-bottom: 1px solid var(--border-light);
  }

  .command-popover-section:last-child {
    border-bottom: none;
  }

  .command-popover-category {
    padding: 6px 14px 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }

  .command-popover-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .command-popover-item:hover {
    background: var(--bg-hover);
  }

  .command-popover-item-name {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    font-weight: 500;
    color: var(--accent-primary);
    min-width: 80px;
  }

  .command-popover-item-desc {
    font-size: 12px;
    color: var(--text-secondary);
    flex: 1;
  }

  .command-popover-footer {
    padding: 8px 14px;
    border-top: 1px solid var(--border-light);
    font-size: 11px;
    color: var(--text-muted);
    text-align: center;
  }

  .command-popover-footer kbd {
    display: inline-block;
    padding: 2px 5px;
    font-size: 10px;
    font-family: inherit;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    margin: 0 2px;
  }

</style>

<div id="pets">
  <div class="pet-list"></div>
  <div id="profile-bar"></div>
</div>

<div id="resize-handle"></div>

<div id="messages">
  <div id="anchor"></div>
</div>

<div id="chat-bar">
  <div class="command-row">
    <div class="command-header">
      <span class="command-label" id="command-label">Command</span>
      <button class="command-cancel" id="command-cancel" title="Cancel (Esc)">&times;</button>
    </div>
    <div id="chat-input-wrapper">
      <div id="chat-message" contenteditable="true" data-placeholder="Type / for commands, or @recipient message..."></div>
      <div id="token-menu" class="token-menu"></div>
      <div id="command-menu" class="token-menu"></div>
      <div id="chat-error"></div>
    </div>
    <div id="inline-form-container"></div>
    <div id="command-error"></div>
    <div class="command-footer">
      <button id="command-submit-button">Execute</button>
      <button class="command-cancel-footer" id="command-cancel-footer" title="Cancel (Esc)">&times;</button>
    </div>
    <div id="chat-button-wrapper" style="position: relative;">
      <button id="chat-menu-button" title="Commands">🐈‍⬛</button>
      <button id="chat-send-button">Send</button>
      <div id="chat-command-popover"></div>
    </div>
  </div>
  <div id="chat-modeline"></div>
</div>

<div id="eval-form-backdrop"></div>
<div id="eval-form-container"></div>


<div id="value-frame" class="frame">
  <div id="value-window" class="window">
    <p><div id="value-value"></div>
    <div class="value-actions">
      <div class="value-save-form">
        <label>Save as:</label>
        <input type="text" id="value-save-name" placeholder="pet.name.path" />
        <button id="value-save-button">Save</button>
      </div>
      <button id="value-close">Close</button>
    </div>
  </div>
</div>

<div id="help-modal-container"></div>
`;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'long',
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: 'short',
});

/**
 * @param {Date} date
 * @returns {string}
 */
const relativeTime = date => {
  const now = Date.now();
  const then = date.getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return '';
};

const numberFormatter = new Intl.NumberFormat();

/**
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} $end
 * @param {unknown} powers
 */
const inboxComponent = async ($parent, $end, powers) => {
  $parent.scrollTo(0, $parent.scrollHeight);

  const selfId = await E(powers).identify('SELF');
  for await (const message of makeRefIterator(E(powers).followMessages())) {
    // Read DOM at animation frame to determine whether to pin scroll to bottom
    // of the messages pane.
    const wasAtEnd = await new Promise(resolve =>
      requestAnimationFrame(() => {
        const scrollTop = /** @type {number} */ ($parent.scrollTop);
        const endScrollTop = /** @type {number} */ (
          $parent.scrollHeight - $parent.clientHeight
        );
        resolve(scrollTop > endScrollTop - 10);
      }),
    );

    const {
      number: rawNumber,
      from: fromId,
      to: toId,
      date,
      dismissed,
    } = message;
    const number = Number(rawNumber);

    const isSent = fromId === selfId;

    const $message = document.createElement('div');
    $message.className = isSent ? 'message sent' : 'message';

    const $error = document.createElement('span');
    $error.style.color = 'red';
    $error.innerText = '';

    dismissed.then(() => {
      $message.remove();
    });

    const parsedDate = new Date(date);
    const $timestamp = document.createElement('span');
    $timestamp.className = 'timestamp';
    $timestamp.innerText = timeFormatter.format(parsedDate);

    const $tooltip = document.createElement('span');
    $tooltip.className = 'timestamp-tooltip';

    const $controls = document.createElement('span');
    $controls.className = 'timestamp-controls';

    const $msgNum = document.createElement('span');
    $msgNum.className = 'timestamp-num';
    $msgNum.innerText = `#${number}`;
    $controls.appendChild($msgNum);

    const $dismiss = document.createElement('button');
    $dismiss.className = 'dismiss-button';
    $dismiss.innerText = '×';
    $dismiss.title = 'Dismiss';
    $dismiss.onclick = () => {
      E(powers)
        .dismiss(number)
        .catch(error => {
          $error.innerText = ` ${error.message}`;
        });
    };
    $controls.appendChild($dismiss);

    $tooltip.appendChild($controls);

    const $times = document.createElement('span');
    $times.className = 'timestamp-times';
    const relative = relativeTime(parsedDate);
    const timeLines = [date, dateFormatter.format(parsedDate), relative].filter(
      Boolean,
    );
    for (const line of timeLines) {
      const $line = document.createElement('div');
      $line.className = 'timestamp-line';

      const $text = document.createElement('span');
      $text.innerText = line;
      $line.appendChild($text);

      const $copy = document.createElement('span');
      $copy.className = 'timestamp-copy';
      $copy.innerText = '⧉';
      $line.appendChild($copy);

      $line.onclick = () => {
        navigator.clipboard.writeText(line).then(() => {
          $copy.innerText = '✓';
          setTimeout(() => {
            $copy.innerText = '⧉';
          }, 1000);
        });
      };

      $times.appendChild($line);
    }
    $tooltip.appendChild($times);

    $timestamp.appendChild($tooltip);
    $message.appendChild($timestamp);

    const $body = document.createElement('div');
    $body.className = 'message-body';
    $body.appendChild($error);
    $message.appendChild($body);

    // Create sender/recipient chip to be injected into message content
    /** @type {HTMLElement | null} */
    let $senderChip = null;
    if (!isSent) {
      const fromNames = await E(powers).reverseIdentify(fromId);
      const fromName = fromNames?.[0];
      if (fromName === undefined) {
        continue;
      }
      $senderChip = document.createElement('b');
      $senderChip.innerText = `@${fromName}`;
    } else {
      const toNames = await E(powers).reverseIdentify(toId);
      const toName = toNames?.[0];
      if (toName !== undefined) {
        $senderChip = document.createElement('b');
        $senderChip.innerText = `@${toName}`;
      }
    }

    if (message.type === 'request') {
      const { description, settled } = message;

      const $description = document.createElement('span');
      // Inject sender chip before the description text
      if ($senderChip) {
        $description.appendChild($senderChip);
        $description.appendChild(document.createTextNode(' '));
      }
      $description.appendChild(
        document.createTextNode(JSON.stringify(description)),
      );
      $body.appendChild($description);

      const $input = document.createElement('span');
      $body.appendChild($input);

      const $pet = document.createElement('input');
      $pet.autocomplete = 'off';
      $pet.dataset.formType = 'other';
      $pet.dataset.lpignore = 'true';
      $input.appendChild($pet);

      const $resolve = document.createElement('button');
      $resolve.innerText = 'resolve';
      $input.appendChild($resolve);

      const $reject = document.createElement('button');
      $reject.innerText = 'reject';
      $reject.onclick = () => {
        E(powers)
          .reject(number, $pet.value)
          .then(() => {
            $input.innerText = ' Rejected ';
          })
          .catch(error => {
            $error.innerText = ` ${error.message}`;
          });
      };
      $input.appendChild($reject);

      $resolve.onclick = () => {
        E(powers)
          .resolve(number, $pet.value)
          .catch(error => {
            $error.innerText = ` ${error.message}`;
          });
      };

      settled.then(status => {
        $input.innerText = ` ${status} `;
      });
    } else if (message.type === 'package') {
      const { strings, names } = message;
      assert(Array.isArray(strings));
      assert(Array.isArray(names));

      // Prepare text with placeholders for markdown rendering
      const textWithPlaceholders = prepareTextWithPlaceholders(strings);
      const { fragment, insertionPoints } =
        renderMarkdown(textWithPlaceholders);

      // Inject sender chip into the first paragraph or heading
      // But NOT into code fence wrappers or lists - prepend a new paragraph instead
      if ($senderChip) {
        // Find first element that's a plain paragraph (not code fence wrapper) or heading
        const $firstPara = fragment.querySelector(
          'p:not(.md-code-fence-wrapper), h1, h2, h3, h4, h5, h6',
        );
        const $firstChild = fragment.firstChild;
        const isCodeFenceOrList =
          $firstChild &&
          (($firstChild instanceof Element &&
            $firstChild.classList.contains('md-code-fence-wrapper')) ||
            ($firstChild instanceof Element && $firstChild.tagName === 'UL') ||
            ($firstChild instanceof Element && $firstChild.tagName === 'OL'));

        if ($firstPara && !isCodeFenceOrList) {
          // Insert into existing paragraph or heading
          $firstPara.insertBefore(
            document.createTextNode(' '),
            $firstPara.firstChild,
          );
          $firstPara.insertBefore($senderChip, $firstPara.firstChild);
        } else {
          // Prepend a new paragraph for the chip
          const $chipPara = document.createElement('p');
          $chipPara.className = 'md-paragraph';
          $chipPara.appendChild($senderChip);
          fragment.insertBefore($chipPara, fragment.firstChild);
        }
      }

      // Append the rendered markdown
      $body.appendChild(fragment);

      // Create token chips for each insertion point
      for (
        let index = 0;
        index < Math.min(insertionPoints.length, names.length);
        index += 1
      ) {
        assert.typeof(names[index], 'string');
        const edgeName = names[index];
        const $slot = insertionPoints[index];

        const $token = document.createElement('span');
        $token.className = 'token';

        const $name = document.createElement('b');
        $name.innerText = `@${edgeName}`;
        $token.appendChild($name);

        const $popup = document.createElement('span');
        $popup.className = 'token-popup';

        const $as = document.createElement('input');
        $as.type = 'text';
        $as.placeholder = edgeName;
        $as.autocomplete = 'off';
        $as.dataset.formType = 'other';
        $as.dataset.lpignore = 'true';
        $popup.appendChild($as);

        const handleAdopt = () => {
          E(powers)
            .adopt(number, edgeName, $as.value || edgeName)
            .then(
              () => {
                $as.value = '';
              },
              error => {
                $error.innerText = ` ${error.message}`;
              },
            );
        };

        $as.addEventListener('keyup', event => {
          const { key, repeat, metaKey } = event;
          if (repeat || metaKey) return;
          if (key === 'Enter') {
            handleAdopt();
          }
        });

        const $adopt = document.createElement('button');
        $adopt.innerText = 'Adopt';
        $adopt.onclick = handleAdopt;
        $popup.appendChild($adopt);

        $token.appendChild($popup);

        // Replace the placeholder slot with the token
        $slot.replaceWith($token);
      }
    } else if (message.type === 'eval-request') {
      const { source, codeNames, petNamePaths, settled } =
        /** @type {{ source: string, codeNames: string[], petNamePaths: Array<string | string[]>, settled: Promise<string> }} */ (
          message
        );

      // Show sender chip
      if ($senderChip) {
        const $senderLine = document.createElement('p');
        $senderLine.appendChild($senderChip);
        $senderLine.appendChild(
          document.createTextNode(' requests evaluation:'),
        );
        $body.appendChild($senderLine);
      }

      // Show source code
      const $codeLabel = document.createElement('p');
      $codeLabel.textContent = 'Source:';
      $body.appendChild($codeLabel);

      const $pre = document.createElement('pre');
      const $code = document.createElement('code');
      $code.textContent = source;
      $pre.appendChild($code);
      $body.appendChild($pre);

      // Show endowment mappings
      if (codeNames.length > 0) {
        const $endowLabel = document.createElement('p');
        $endowLabel.textContent = 'Endowments:';
        $body.appendChild($endowLabel);

        const $endowList = document.createElement('ul');
        for (let i = 0; i < codeNames.length; i += 1) {
          const $li = document.createElement('li');
          const pathStr = Array.isArray(petNamePaths[i])
            ? petNamePaths[i].join('.')
            : String(petNamePaths[i]);
          $li.textContent = `${codeNames[i]} <- ${pathStr}`;
          $endowList.appendChild($li);
        }
        $body.appendChild($endowList);
      }

      // Approve/Reject controls
      const $evalControls = document.createElement('span');
      $body.appendChild($evalControls);

      const $approve = document.createElement('button');
      $approve.innerText = 'Approve';
      $approve.onclick = () => {
        E(powers)
          .approveEvaluation(number)
          .catch(error => {
            $error.innerText = ` ${error.message}`;
          });
      };
      $evalControls.appendChild($approve);

      const $rejectBtn = document.createElement('button');
      $rejectBtn.innerText = 'Reject';
      $rejectBtn.onclick = () => {
        E(powers)
          .reject(number, 'Evaluation rejected')
          .then(() => {
            $evalControls.innerText = ' Rejected ';
          })
          .catch(error => {
            $error.innerText = ` ${error.message}`;
          });
      };
      $evalControls.appendChild($rejectBtn);

      settled.then(status => {
        $evalControls.innerText = ` ${status} `;
      });
    } else if (message.type === 'definition') {
      const { source, slots, settled } = message;

      // Show sender chip
      if ($senderChip) {
        const $senderLine = document.createElement('p');
        $senderLine.appendChild($senderChip);
        $senderLine.appendChild(
          document.createTextNode(' proposed definition:'),
        );
        $body.appendChild($senderLine);
      }

      // Show source code
      const $pre = document.createElement('pre');
      const $code = document.createElement('code');
      $code.textContent = source;
      $pre.appendChild($code);
      $body.appendChild($pre);

      // Show slots that need binding
      const slotEntries = Object.entries(slots || {});
      if (slotEntries.length > 0) {
        const $slotsLabel = document.createElement('p');
        $slotsLabel.textContent = 'Capability slots:';
        $body.appendChild($slotsLabel);

        const $slotList = document.createElement('div');
        $slotList.className = 'definition-slots';

        /** @type {Record<string, HTMLInputElement>} */
        const bindingInputs = {};

        for (const [slotName, slotInfo] of slotEntries) {
          const $row = document.createElement('div');
          $row.className = 'definition-slot-row';

          const $label = document.createElement('label');
          $label.textContent = `${slotName}: `;
          $label.title =
            /** @type {{ label: string }} */ (slotInfo).label || '';
          $row.appendChild($label);

          const $desc = document.createElement('span');
          $desc.className = 'slot-description';
          $desc.textContent =
            /** @type {{ label: string }} */ (slotInfo).label || '';
          $row.appendChild($desc);

          const $input = document.createElement('input');
          $input.type = 'text';
          $input.placeholder = 'pet name';
          $input.className = 'slot-binding-input';
          $row.appendChild($input);
          bindingInputs[slotName] = $input;

          $slotList.appendChild($row);
        }
        $body.appendChild($slotList);

        // Endow/Reject controls
        const $defnSlotsControls = document.createElement('span');
        $body.appendChild($defnSlotsControls);

        const $endow = document.createElement('button');
        $endow.innerText = 'Endow';
        $endow.onclick = () => {
          /** @type {Record<string, string>} */
          const bindings = {};
          for (const [slotName, $input] of Object.entries(bindingInputs)) {
            const val = $input.value.trim();
            if (val) {
              bindings[slotName] = val;
            }
          }
          E(powers)
            .endow(number, bindings)
            .catch(error => {
              $error.innerText = ` ${error.message}`;
            });
        };
        $defnSlotsControls.appendChild($endow);

        const $rejectBtn = document.createElement('button');
        $rejectBtn.innerText = 'Reject';
        $rejectBtn.onclick = () => {
          E(powers)
            .reject(number, 'Definition rejected')
            .then(() => {
              $defnSlotsControls.innerText = ' Rejected ';
            })
            .catch(error => {
              $error.innerText = ` ${error.message}`;
            });
        };
        $defnSlotsControls.appendChild($rejectBtn);

        settled.then(status => {
          $defnSlotsControls.innerText = ` ${status} `;
        });
      } else {
        // No slots — just approve/reject like an eval
        const $defnControls = document.createElement('span');
        $body.appendChild($defnControls);

        const $endow = document.createElement('button');
        $endow.innerText = 'Approve';
        $endow.onclick = () => {
          E(powers)
            .endow(number, {})
            .catch(error => {
              $error.innerText = ` ${error.message}`;
            });
        };
        $defnControls.appendChild($endow);

        const $rejectBtn = document.createElement('button');
        $rejectBtn.innerText = 'Reject';
        $rejectBtn.onclick = () => {
          E(powers)
            .reject(number, 'Definition rejected')
            .then(() => {
              $defnControls.innerText = ' Rejected ';
            })
            .catch(error => {
              $error.innerText = ` ${error.message}`;
            });
        };
        $defnControls.appendChild($rejectBtn);

        settled.then(status => {
          $defnControls.innerText = ` ${status} `;
        });
      }
    }

    $parent.insertBefore($message, $end);

    if (wasAtEnd) {
      $parent.scrollTo(0, $parent.scrollHeight);
    }
  }
};

/**
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} $end
 * @param {unknown} powers
 * @param {{ showValue: (value: unknown) => void, enterHost: (name: string) => void }} options
 */
const inventoryComponent = async (
  $parent,
  $end,
  powers,
  { showValue, enterHost },
) => {
  const $list = $parent.querySelector('.pet-list') || $parent;

  const $names = new Map();
  for await (const change of makeRefIterator(E(powers).followNameChanges())) {
    if ('add' in change) {
      const name = change.add;

      const $item = document.createElement('div');
      $item.className = 'pet-item';

      const $name = document.createElement('span');
      $name.className = 'pet-name';
      $name.textContent = name;
      $item.appendChild($name);

      const $buttons = document.createElement('span');
      $buttons.className = 'pet-buttons';

      const $enter = document.createElement('button');
      $enter.className = 'enter-button';
      $enter.textContent = 'Enter';
      $enter.title = 'Enter this host profile';
      $buttons.appendChild($enter);

      const $show = document.createElement('button');
      $show.className = 'show-button';
      $show.textContent = 'View';
      $buttons.appendChild($show);

      const $remove = document.createElement('button');
      $remove.className = 'remove-button';
      $remove.textContent = '×';
      $buttons.appendChild($remove);

      $item.appendChild($buttons);
      $list.appendChild($item);

      $enter.onclick = () => enterHost(name);
      $show.onclick = () =>
        E(powers).lookup(name).then(showValue, window.reportError);
      $remove.onclick = () => E(powers).remove(name).catch(window.reportError);

      $names.set(name, $item);
    } else if ('remove' in change) {
      const $item = $names.get(change.remove);
      if ($item !== undefined) {
        $item.remove();
        $names.delete(change.remove);
      }
    }
  }
};

/**
 * @param {HTMLElement} $parent
 * @param {{ focusValue: (value: unknown) => void, blurValue: () => void }} callbacks
 */
const controlsComponent = ($parent, { focusValue, blurValue }) => {
  const $valueFrame = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-frame')
  );

  const showValue = value => {
    $valueFrame.dataset.show = 'true';
    focusValue(value);
  };

  const dismissValue = () => {
    $valueFrame.dataset.show = 'false';
    blurValue();
  };

  return { showValue, dismissValue };
};

/**
 * @param {HTMLElement} $parent
 * @param {unknown} powers
 * @param {object} options
 * @param {(value: unknown) => void} options.showValue
 * @param {(hostName: string) => Promise<void>} options.enterProfile
 * @param {() => void} options.exitProfile
 * @param {boolean} options.canExitProfile
 */
const chatBarComponent = (
  $parent,
  powers,
  { showValue, enterProfile, exitProfile, canExitProfile },
) => {
  const $chatBar = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-bar')
  );
  const $sendButton = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-send-button')
  );
  const $input = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-message')
  );
  const $tokenMenu = /** @type {HTMLElement} */ (
    $parent.querySelector('#token-menu')
  );
  const $commandMenu = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-menu')
  );
  const $error = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-error')
  );
  const $commandError = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-error')
  );
  const $evalFormContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#eval-form-container')
  );
  const $evalFormBackdrop = /** @type {HTMLElement} */ (
    $parent.querySelector('#eval-form-backdrop')
  );
  const $inlineFormContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#inline-form-container')
  );
  const $commandLabel = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-label')
  );
  const $commandCancel = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-cancel')
  );
  const $commandSubmitButton = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#command-submit-button')
  );
  const $commandCancelFooter = /** @type {HTMLElement} */ (
    $parent.querySelector('#command-cancel-footer')
  );
  const $messagesContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#messages')
  );
  const $helpModalContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#help-modal-container')
  );
  const $menuButton = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#chat-menu-button')
  );
  const $commandPopover = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-command-popover')
  );
  const $modeline = /** @type {HTMLElement} */ (
    $parent.querySelector('#chat-modeline')
  );

  /**
   * Update the modeline content based on the current mode.
   * @param {string | null} commandName
   */
  const updateModeline = commandName => {
    if (!commandName) {
      $chatBar.classList.remove('has-modeline');
      $modeline.innerHTML = '';
      return;
    }

    let hints = '';
    if (commandName === 'js') {
      hints = `
        <span class="modeline-hint"><kbd>@</kbd> add endowment</span>
        <span class="modeline-hint"><kbd>Enter</kbd> evaluate</span>
        <span class="modeline-hint"><kbd>Cmd+Enter</kbd> expand to editor</span>
        <span class="modeline-hint"><kbd>Esc</kbd> cancel</span>
      `;
    } else {
      hints = `
        <span class="modeline-hint"><kbd>Enter</kbd> submit</span>
        <span class="modeline-hint"><kbd>Tab</kbd> next field</span>
        <span class="modeline-hint"><kbd>Esc</kbd> cancel</span>
      `;
    }

    $modeline.innerHTML = hints;
    $chatBar.classList.add('has-modeline');
  };

  /** @type {'send' | 'selecting' | 'inline' | 'js'} */
  let mode = 'send';
  let commandPrefix = '';
  /** @type {string | null} */
  let currentCommand = null;

  /** @type {import('./eval-form.js').EvalFormAPI | null} */
  let evalForm = null;

  // Initialize the send form component
  const sendForm = sendFormComponent({
    $input,
    $menu: $tokenMenu,
    $error,
    $sendButton,
    E,
    makeRefIterator,
    powers,
    shouldHandleEnter: () => mode === 'send',
  });

  // Initialize command executor
  const executor = createCommandExecutor({
    powers,
    showValue,
    showMessage: message => {
      // For now, just log messages - could add a toast system later
      console.log(message);
    },
    showError: error => {
      const message = error?.message || String(error) || 'Unknown error';
      // Use command error element in command mode, chat error otherwise
      if (mode === 'inline') {
        $commandError.textContent = message;
      } else {
        $error.textContent = message;
      }
      console.error('Command error:', error);
    },
  });

  // Track active message number input for the picker
  /** @type {HTMLInputElement | null} */
  let activeMessageNumberInput = null;

  // Initialize message picker
  const messagePicker = createMessagePicker({
    $messagesContainer,
    onSelect: messageNumber => {
      if (activeMessageNumberInput) {
        activeMessageNumberInput.value = String(messageNumber);
        activeMessageNumberInput.dispatchEvent(
          new Event('input', { bubbles: true }),
        );
      }
    },
  });

  // Initialize help modal
  const helpModal = createHelpModal({
    $container: $helpModalContainer,
    onClose: () => {
      sendForm.focus();
    },
  });

  // Category display names for hamburger menu
  const CATEGORY_LABELS = {
    messaging: 'Messaging',
    execution: 'Execution',
    storage: 'Storage',
    connections: 'Connections',
    workers: 'Workers',
    agents: 'Agents',
    bundles: 'Bundles',
    profile: 'Profile',
    system: 'System',
  };

  /**
   * Update the has-content class on the chat bar.
   */
  const updateHasContent = () => {
    const text = $input.textContent || '';
    if (text.trim().length > 0 && mode === 'send') {
      $chatBar.classList.add('has-content');
      // Show send mode modeline hints
      $modeline.innerHTML = `
        <span class="modeline-hint"><kbd>Enter</kbd> send</span>
        <span class="modeline-hint"><kbd>/</kbd> commands</span>
        <span class="modeline-hint"><kbd>@</kbd> reference</span>
      `;
      $chatBar.classList.add('has-modeline');
    } else {
      $chatBar.classList.remove('has-content');
      // Show space hint when empty and there's a last recipient
      const lastRecipient = sendForm.getLastRecipient();
      if (mode === 'send' && lastRecipient) {
        $modeline.innerHTML = `
          <span class="modeline-hint"><kbd>Space</kbd> continue with @${lastRecipient}</span>
        `;
        $chatBar.classList.add('has-modeline');
      } else {
        $chatBar.classList.remove('has-modeline');
        $modeline.innerHTML = '';
      }
    }
  };

  /**
   * Render the command popover content.
   */
  const renderCommandPopover = () => {
    const categories = getCategories();
    let html = '<div class="command-popover-header">Commands</div>';

    for (const category of categories) {
      const commands = getCommandsByCategory(category);
      const label = CATEGORY_LABELS[category] || category;

      html += '<div class="command-popover-section">';
      html += `<div class="command-popover-category">${label}</div>`;

      for (const cmd of commands) {
        html += `
          <div class="command-popover-item" data-command="${cmd.name}">
            <span class="command-popover-item-name">/${cmd.name}</span>
            <span class="command-popover-item-desc">${cmd.description}</span>
          </div>
        `;
      }

      html += '</div>';
    }

    html +=
      '<div class="command-popover-footer">Type <kbd>/</kbd> in input for quick access</div>';
    $commandPopover.innerHTML = html;

    // Attach click handlers
    const $items = $commandPopover.querySelectorAll('.command-popover-item');
    for (const $item of $items) {
      $item.addEventListener('click', () => {
        const cmdName = /** @type {HTMLElement} */ ($item).dataset.command;
        if (cmdName) {
          hideCommandPopover(); // eslint-disable-line no-use-before-define
          handleCommandSelect(cmdName); // eslint-disable-line no-use-before-define
        }
      });
    }
  };

  const showCommandPopover = () => {
    renderCommandPopover();
    $commandPopover.classList.add('visible');
  };

  const hideCommandPopover = () => {
    $commandPopover.classList.remove('visible');
  };

  // Menu button click handler
  $menuButton.addEventListener('click', event => {
    event.stopPropagation();
    if ($commandPopover.classList.contains('visible')) {
      hideCommandPopover();
    } else {
      showCommandPopover();
    }
  });

  // Close popover when clicking outside
  document.addEventListener('click', event => {
    if (
      !$commandPopover.contains(/** @type {Node} */ (event.target)) &&
      !$menuButton.contains(/** @type {Node} */ (event.target))
    ) {
      hideCommandPopover();
    }
  });

  // Initialize inline command form
  const inlineForm = createInlineCommandForm({
    $container: $inlineFormContainer,
    E,
    powers,
    onSubmit: async (commandName, data) => {
      messagePicker.disable();
      $commandError.textContent = '';

      // Special handling for enter command - uses profile navigation
      if (commandName === 'enter') {
        const { hostName } = /** @type {{ hostName: string }} */ (data);
        exitCommandMode(); // eslint-disable-line no-use-before-define
        await enterProfile(hostName);
        return;
      }

      const result = await executor.execute(commandName, data);
      if (result.success) {
        exitCommandMode(); // eslint-disable-line no-use-before-define
        // Always show js results (even undefined), skip show/list which handle their own display
        if (commandName === 'js') {
          showValue(result.value);
        } else if (
          result.value !== undefined &&
          commandName !== 'show' &&
          commandName !== 'list'
        ) {
          showValue(result.value);
        }
      }
      // Error case: showError callback already set $commandError.textContent
    },
    onCancel: () => {
      messagePicker.disable();
      exitCommandMode(); // eslint-disable-line no-use-before-define
    },
    onValidityChange: isValid => {
      $commandSubmitButton.disabled = !isValid;
    },
    onMessageNumberClick: () => {
      // Enable picker and track the input
      const $msgInput = $inlineFormContainer.querySelector(
        '.message-number-input',
      );
      if ($msgInput) {
        activeMessageNumberInput = /** @type {HTMLInputElement} */ ($msgInput);
        messagePicker.enable();
      }
    },
    onExpandEval: async data => {
      // Expand inline eval to full modal
      // Exit inline command mode first
      exitCommandMode(); // eslint-disable-line no-use-before-define
      // Show the eval form with pre-populated data
      await showEvalForm(); // eslint-disable-line no-use-before-define
      if (evalForm) {
        evalForm.setData({
          source: data.source,
          endowments: data.endowments,
          resultName: '',
          workerName: 'MAIN',
          cursorPosition: data.cursorPosition,
        });
      }
    },
  });

  /**
   * Enter command mode for an inline command.
   * @param {string} commandName
   */
  const enterCommandMode = commandName => {
    const command = getCommand(commandName);
    if (!command) return;

    mode = 'inline';
    currentCommand = commandName;
    $chatBar.classList.add('command-mode');
    $commandLabel.textContent = command.label;
    $commandSubmitButton.textContent = command.submitLabel || 'Execute';
    $commandSubmitButton.disabled = true;
    updateModeline(commandName);

    inlineForm.setCommand(commandName);

    // Auto-enable message picker for commands that need message numbers
    const needsMessagePicker = command.fields.some(
      f => f.type === 'messageNumber',
    );
    if (needsMessagePicker) {
      messagePicker.enable();
      // Track the message number input
      setTimeout(() => {
        const $msgInput = $inlineFormContainer.querySelector(
          '.message-number-input',
        );
        if ($msgInput) {
          activeMessageNumberInput = /** @type {HTMLInputElement} */ (
            $msgInput
          );
        }
      }, 50);
    }

    // Focus the first field after a brief delay for DOM update
    setTimeout(() => {
      inlineForm.focus();
    }, 50);
  };

  /**
   * Exit command mode and return to send mode.
   */
  const exitCommandMode = () => {
    mode = 'send';
    currentCommand = null;
    $chatBar.classList.remove('command-mode');
    updateModeline(null);
    messagePicker.disable();
    activeMessageNumberInput = null;
    inlineForm.clear();
    sendForm.clear();
    sendForm.focus();
    $error.textContent = '';
    $commandError.textContent = '';
    updateHasContent();
  };

  /**
   * Show the eval form (lazily initialize if needed).
   */
  const showEvalForm = async () => {
    if (!evalForm) {
      // Lazily initialize the eval form
      evalForm = await createEvalForm({
        $container: $evalFormContainer,
        E,
        powers,
        onSubmit: async data => {
          // Call E(powers).evaluate()
          // Pet names must be arrays (path segments for dot-delimited names)
          const codeNames = data.endowments.map(e => e.codeName);
          const petNamePaths = data.endowments.map(e => e.petName.split('.'));
          const resultNamePath = data.resultName
            ? data.resultName.split('.')
            : undefined;
          const workerName = data.workerName || 'MAIN';

          await E(powers).evaluate(
            workerName,
            data.source,
            codeNames,
            petNamePaths,
            resultNamePath,
          );
        },
        onClose: () => {
          hideEvalForm(); // eslint-disable-line no-use-before-define
        },
      });
    }

    mode = 'js';
    $evalFormBackdrop.style.display = 'block';
    $evalFormContainer.style.display = 'block';
    evalForm.show();
  };

  const hideEvalForm = () => {
    mode = 'send';
    $evalFormBackdrop.style.display = 'none';
    $evalFormContainer.style.display = 'none';
    if (evalForm) {
      evalForm.hide();
    }
    sendForm.focus();
  };

  // Click on backdrop closes eval form
  $evalFormBackdrop.addEventListener('click', () => {
    if (evalForm && evalForm.isDirty()) {
      // Could add confirmation here
    }
    hideEvalForm();
  });

  // Command cancel button (header)
  $commandCancel.addEventListener('click', () => {
    exitCommandMode();
  });

  // Command cancel button (footer - far right)
  $commandCancelFooter.addEventListener('click', () => {
    exitCommandMode();
  });

  // Command submit button
  $commandSubmitButton.addEventListener('click', async () => {
    if (currentCommand && inlineForm.isValid()) {
      $commandError.textContent = '';
      const data = inlineForm.getData();

      // Special handling for enter command - uses profile navigation
      if (currentCommand === 'enter') {
        const { hostName } = /** @type {{ hostName: string }} */ (data);
        exitCommandMode();
        await enterProfile(hostName);
        return;
      }

      const result = await executor.execute(currentCommand, data);
      if (result.success) {
        exitCommandMode();
        // Always show js results (even undefined), skip show/list which handle their own display
        if (currentCommand === 'js') {
          showValue(result.value);
        } else if (
          result.value !== undefined &&
          currentCommand !== 'show' &&
          currentCommand !== 'list'
        ) {
          showValue(result.value);
        }
      }
      // Error case: showError callback already set $commandError.textContent
    }
  });

  /**
   * Handle command selection.
   * @param {string} commandName
   */
  const handleCommandSelect = commandName => {
    commandPrefix = '';
    sendForm.clear();

    const command = getCommand(commandName);
    if (!command) {
      exitCommandMode();
      return;
    }

    // Route based on command mode
    switch (command.mode) {
      case 'modal':
        // Reset mode since we're leaving selecting state
        mode = 'send';
        // For now only js uses modal
        if (commandName === 'js') {
          showEvalForm();
        }
        break;

      case 'immediate':
        // Reset mode since we're leaving selecting state
        mode = 'send';
        // Special handling for help command
        if (commandName === 'help') {
          helpModal.show();
          break;
        }
        // Special handling for exit command
        if (commandName === 'exit') {
          if (canExitProfile) {
            exitProfile();
          } else {
            $error.textContent = 'Already at home profile';
            setTimeout(() => {
              $error.textContent = '';
            }, 3000);
          }
          break;
        }
        // Execute immediately with current data
        executor.execute(commandName, {}).then(result => {
          if (result.success && result.value !== undefined) {
            showValue(result.value);
          }
        });
        // Refocus the input after immediate command
        setTimeout(() => $input.focus(), 50);
        break;

      case 'inline':
      default:
        enterCommandMode(commandName);
        break;
    }
  };

  const handleCommandCancel = () => {
    mode = 'send';
    commandPrefix = '';
  };

  // Initialize command selector
  const commandSelector = commandSelectorComponent({
    $menu: $commandMenu,
    onSelect: handleCommandSelect,
    onCancel: handleCommandCancel,
  });

  /**
   * Get current input text.
   * @returns {string}
   */
  const getInputText = () => $input.textContent || '';

  // Handle input events for command detection
  $input.addEventListener('input', () => {
    const text = getInputText();

    // Update has-content class for showing/hiding send button
    updateHasContent();

    if (mode === 'selecting') {
      // Update filter as user types after "/"
      if (text.startsWith('/')) {
        commandPrefix = text.slice(1);
        commandSelector.filter(commandPrefix);
      } else {
        // User deleted the "/" - cancel command selection
        commandSelector.hide();
        mode = 'send';
        commandPrefix = '';
      }
    } else if (mode === 'send') {
      // Check if "/" was typed at the start of empty input
      if (text === '/') {
        mode = 'selecting';
        commandPrefix = '';
        commandSelector.show();
      }
    }
  });

  // Handle keydown for command selection navigation
  $input.addEventListener('keydown', event => {
    if (mode === 'selecting' && commandSelector.isVisible()) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          commandSelector.selectNext();
          break;
        case 'ArrowUp':
          event.preventDefault();
          commandSelector.selectPrev();
          break;
        case 'Tab':
        case 'Enter':
        case ' ':
          event.preventDefault();
          event.stopImmediatePropagation();
          commandSelector.confirmSelection();
          break;
        case 'Escape':
          event.preventDefault();
          commandSelector.hide();
          sendForm.clear();
          mode = 'send';
          commandPrefix = '';
          break;
        default:
          break;
      }
    }
  });

  // Global escape key handler
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (helpModal.isVisible()) {
        event.preventDefault();
        helpModal.hide();
        sendForm.focus();
      } else if (mode === 'inline') {
        event.preventDefault();
        exitCommandMode();
      } else if (mode === 'send') {
        // Clear send input and modeline
        event.preventDefault();
        sendForm.clear();
        $error.textContent = '';
        updateHasContent();
      }
    }
  });

  // Auto-focus the command line
  sendForm.focus();

  // Focus command line on any keypress when nothing else is focused
  window.addEventListener('keydown', event => {
    // Skip if in command mode or if already focused on an interactive element
    if (mode !== 'send') return;

    const active = document.activeElement;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.tagName === 'BUTTON' ||
        /** @type {HTMLElement} */ (active).isContentEditable)
    ) {
      return;
    }

    // Skip modifier keys and special keys
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.key === 'Escape' ||
      event.key === 'Tab' ||
      event.key.startsWith('Arrow') ||
      event.key.startsWith('F') ||
      event.key === 'Enter' ||
      event.key === 'Backspace' ||
      event.key === 'Delete'
    ) {
      return;
    }

    // Focus the command line
    sendForm.focus();

    // For printable characters, insert them
    if (event.key.length === 1) {
      document.execCommand('insertText', false, event.key);
      event.preventDefault();
    }
  });
};

/**
 * @param {unknown} value
 * @returns {HTMLElement}
 */
const render = value => {
  let passStyle;
  try {
    passStyle = passStyleOf(value);
  } catch {
    const $value = document.createElement('div');
    $value.className = 'error';
    $value.innerText = '⚠️ Not passable ⚠️';
    return $value;
  }

  switch (passStyle) {
    case 'null':
    case 'undefined':
    case 'boolean': {
      const $value = document.createElement('span');
      $value.className = 'number';
      $value.innerText = `${value}`;
      return $value;
    }
    case 'bigint': {
      const $value = document.createElement('span');
      $value.className = 'bigint';
      $value.innerText = `${numberFormatter.format(/** @type {bigint} */ (value))}n`;
      return $value;
    }
    case 'number': {
      const $value = document.createElement('span');
      $value.className = 'number';
      $value.innerText = numberFormatter.format(/** @type {number} */ (value));
      return $value;
    }
    case 'string': {
      const $value = document.createElement('span');
      $value.className = 'string';
      $value.innerText = JSON.stringify(value);
      return $value;
    }
    case 'promise': {
      const $value = document.createElement('span');
      $value.innerText = '⏳';
      // TODO await (and respect cancellation)
      return $value;
    }
    case 'copyArray': {
      const $value = document.createElement('span');
      $value.appendChild(document.createTextNode('['));
      const $entries = document.createElement('span');
      $entries.className = 'entries';
      $value.appendChild($entries);
      let $entry;
      for (const child of /** @type {unknown[]} */ (value)) {
        $entry = document.createElement('span');
        $entries.appendChild($entry);
        const $child = render(child);
        $entry.appendChild($child);
        $entry.appendChild(document.createTextNode(', '));
      }
      // Remove final comma.
      if ($entry) {
        $entry.removeChild(/** @type {ChildNode} */ ($entry.lastChild));
      }
      $value.appendChild(document.createTextNode(']'));
      return $value;
    }
    case 'copyRecord': {
      const $value = document.createElement('span');
      $value.appendChild(document.createTextNode('{'));
      const $entries = document.createElement('span');
      $value.appendChild($entries);
      $entries.className = 'entries';
      let $entry;
      for (const [key, child] of Object.entries(
        /** @type {Record<string, unknown>} */ (value),
      )) {
        $entry = document.createElement('span');
        $entries.appendChild($entry);
        const $key = document.createElement('span');
        $key.innerText = `${JSON.stringify(key)}: `;
        $entry.appendChild($key);
        const $child = render(child);
        $entry.appendChild($child);
        $entry.appendChild(document.createTextNode(', '));
      }
      if ($entry) {
        // Remove final comma.
        $entry.removeChild(/** @type {ChildNode} */ ($entry.lastChild));
      }
      $value.appendChild(document.createTextNode('}'));
      return $value;
    }
    case 'tagged': {
      const $value = document.createElement('span');
      const $tag = document.createElement('span');
      const tagged =
        /** @type {{ [Symbol.toStringTag]: string, payload: unknown }} */ (
          value
        );
      $tag.innerText = `${JSON.stringify(tagged[Symbol.toStringTag])} `;
      $tag.className = 'tag';
      $value.appendChild($tag);
      const $child = render(tagged.payload);
      $value.appendChild($child);
      return $value;
    }
    case 'error': {
      const $value = document.createElement('span');
      $value.className = 'error';
      $value.innerText = /** @type {Error} */ (value).message;
      return $value;
    }
    case 'remotable': {
      const $value = document.createElement('span');
      $value.className = 'remotable';
      const remotable = /** @type {{ [Symbol.toStringTag]: string }} */ (value);
      $value.innerText = remotable[Symbol.toStringTag];
      return $value;
    }
    default: {
      throw new Error(
        'Unreachable if programmed to account for all pass-styles',
      );
    }
  }
};

/**
 * @param {HTMLElement} $parent
 * @param {unknown} powers
 * @param {{ dismissValue: () => void }} options
 */
const valueComponent = ($parent, powers, { dismissValue }) => {
  const $value = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-value')
  );
  const $close = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-close')
  );
  const $saveName = /** @type {HTMLInputElement} */ (
    $parent.querySelector('#value-save-name')
  );
  const $saveButton = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#value-save-button')
  );

  /** @type {unknown} */
  let currentValue;

  const clearValue = () => {
    $value.innerHTML = '';
    $saveName.value = '';
    currentValue = undefined;
    dismissValue();
  };

  $close.addEventListener('click', () => {
    clearValue();
  });

  const handleSave = async () => {
    const name = $saveName.value.trim();
    if (!name || currentValue === undefined) return;

    try {
      // Store the value with the given pet name path
      const petNamePath = name.split('.');
      await E(powers).storeValue(currentValue, petNamePath);
      $saveName.value = '';
      clearValue();
    } catch (error) {
      // Show error feedback
      $saveName.style.borderColor = '#e53e3e';
      setTimeout(() => {
        $saveName.style.borderColor = '';
      }, 2000);
      console.error('Failed to save value:', error);
    }
  };

  $saveButton.addEventListener('click', handleSave);

  $saveName.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSave();
    }
  });

  /** @param {KeyboardEvent} event */
  const handleKey = event => {
    const { key, repeat, metaKey } = event;
    if (repeat || metaKey) return;
    if (key === 'Escape') {
      clearValue();
      event.stopPropagation();
    }
  };

  /** @param {unknown} value */
  const focusValue = value => {
    currentValue = value;
    window.addEventListener('keyup', handleKey);
    $value.innerHTML = '';
    $value.appendChild(render(value));
    $saveName.focus();
  };

  const blurValue = () => {
    window.removeEventListener('keyup', handleKey);
  };

  return { focusValue, blurValue };
};

/**
 * Set up the resizable sidebar handle.
 * @param {HTMLElement} $parent
 */
const resizeHandleComponent = $parent => {
  const $handle = /** @type {HTMLElement} */ (
    $parent.querySelector('#resize-handle')
  );

  const minWidth = 180;
  const maxWidth = 500;

  let isDragging = false;

  const onMouseDown = (/** @type {MouseEvent} */ e) => {
    e.preventDefault();
    isDragging = true;
    $handle.classList.add('dragging');
    document.body.classList.add('resizing');
  };

  const onMouseMove = (/** @type {MouseEvent} */ e) => {
    if (!isDragging) return;
    const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
    document.documentElement.style.setProperty(
      '--sidebar-width',
      `${newWidth}px`,
    );
  };

  const onMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      $handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
    }
  };

  $handle.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

/**
 * Render the profile breadcrumb bar.
 *
 * @param {HTMLElement} $profileBar
 * @param {string[]} profilePath
 * @param {(depth: number) => void} onNavigate - Called with depth to navigate to
 */
const renderProfileBar = ($profileBar, profilePath, onNavigate) => {
  $profileBar.innerHTML = '';

  // Always show "Home" as the root
  const $home = document.createElement('span');
  $home.className = 'profile-breadcrumb';
  if (profilePath.length === 0) {
    $home.classList.add('current');
  }
  $home.textContent = 'Home';
  $home.onclick = () => onNavigate(0);
  $profileBar.appendChild($home);

  // Add each segment of the path
  for (let i = 0; i < profilePath.length; i += 1) {
    const $sep = document.createElement('span');
    $sep.className = 'profile-separator';
    $sep.textContent = '›';
    $profileBar.appendChild($sep);

    const $crumb = document.createElement('span');
    $crumb.className = 'profile-breadcrumb';
    if (i === profilePath.length - 1) {
      $crumb.classList.add('current');
    }
    $crumb.textContent = profilePath[i];
    const depth = i + 1;
    $crumb.onclick = () => onNavigate(depth);
    $profileBar.appendChild($crumb);
  }
};

/**
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {(newPath: string[]) => void} onProfileChange
 */
const bodyComponent = ($parent, rootPowers, profilePath, onProfileChange) => {
  $parent.innerHTML = template;

  const $messages = /** @type {HTMLElement} */ (
    $parent.querySelector('#messages')
  );
  const $anchor = /** @type {HTMLElement} */ ($parent.querySelector('#anchor'));
  const $pets = /** @type {HTMLElement} */ ($parent.querySelector('#pets'));
  const $profileBar = /** @type {HTMLElement} */ (
    $parent.querySelector('#profile-bar')
  );

  // Set up resizable sidebar
  resizeHandleComponent($parent);

  // Resolve powers for the current profile path
  const resolvePowers = async () => {
    /** @type {unknown} */
    let powers = rootPowers;
    for (const name of profilePath) {
      powers = E(powers).lookup(name);
    }
    return powers;
  };

  // Handle entering a host (adding to profile path)
  // Validates that the target has the minimum required interface before entering
  const enterHost = async (/** @type {string} */ hostName) => {
    try {
      // Resolve current powers and look up the target
      const currentPowers = await resolvePowers();
      const targetPowers = await E(currentPowers).lookup(hostName);

      // Verify the target has the minimum required interface for a profile
      // by checking if it responds to identify() - a lightweight check
      const selfId = await E(targetPowers).identify('SELF');
      if (selfId === undefined) {
        throw new Error(`"${hostName}" does not appear to be a valid host`);
      }

      // Passed validation - proceed with profile change
      onProfileChange([...profilePath, hostName]);
    } catch (error) {
      // Report the error - the user can see why entering failed
      window.reportError(/** @type {Error} */ (error));
    }
  };

  // Handle navigating to a specific depth in the profile path
  const navigateToDepth = (/** @type {number} */ depth) => {
    if (depth < profilePath.length) {
      onProfileChange(profilePath.slice(0, depth));
    }
  };

  // Handle exiting to parent profile
  const exitProfile = () => {
    if (profilePath.length > 0) {
      onProfileChange(profilePath.slice(0, -1));
    }
  };

  // Render the profile breadcrumbs
  renderProfileBar($profileBar, profilePath, navigateToDepth);

  // Initialize components with resolved powers
  resolvePowers()
    .then(resolvedPowers => {
      // To they who can avoid forward-references for entangled component
      // dependency-injection, I salute you and welcome your pull requests.
      /* eslint-disable no-use-before-define */
      const { showValue, dismissValue } = controlsComponent($parent, {
        focusValue: value => focusValue(value),
        blurValue: () => blurValue(),
      });
      inboxComponent($messages, $anchor, resolvedPowers).catch(
        window.reportError,
      );
      inventoryComponent($pets, $profileBar, resolvedPowers, {
        showValue,
        enterHost,
      }).catch(window.reportError);
      chatBarComponent($parent, resolvedPowers, {
        showValue,
        enterProfile: enterHost,
        exitProfile,
        canExitProfile: profilePath.length > 0,
      });
      const { focusValue, blurValue } = valueComponent(
        $parent,
        resolvedPowers,
        {
          dismissValue,
        },
      );
      /* eslint-enable no-use-before-define */
    })
    .catch(window.reportError);
};

/**
 * Initialize the chat application with the given powers object.
 *
 * @param {unknown} powers - The powers object from HubCap
 */
export const make = async powers => {
  /** @type {string[]} */
  let currentProfilePath = [];

  const rebuild = () => {
    document.body.innerHTML = '';
    bodyComponent(document.body, powers, currentProfilePath, newPath => {
      currentProfilePath = newPath;
      rebuild();
    });
  };

  rebuild();
};
