# MadShell Quickstart Guide

A modern terminal emulator that uses AI to convert natural language into shell commands. Built as a desktop application with Electron and React, powered by Databricks' LLaMA 3 model for natural language processing.

# Technical Stack

### Frontend
- **Framework**: React
- **Terminal**: xterm.js with addons (fit, web-links, search)
- **UI**: Custom CSS with system vibrancy effects

### Desktop Runtime
- **Framework**: Electron
- **IPC Communication**: Electron IPC Bridge

### AI Integration
- **Model**: Meta's LLaMA 3 (70B parameter model)
- **Platform**: Databricks ML serving

## Prerequisites

- Node.js >= 14
- npm >= 6
- Git
- A Databricks account with:
  - LLaMA 3 model endpoint
  - Bearer token

## Quick Setup

1. Clone and install:
```bash
git clone https://github.com/yourusername/goodshell.git
cd goodshell
npm install
```

2. Configure your Databricks credentials:
```bash
# Create a .env file in the root directory
touch .env

# Add your Databricks credentials
echo "DATABRICKS_ENDPOINT=https://adb-your-workspace.azuredatabricks.net/serving-endpoints/your-model" >> .env
echo "DATABRICKS_TOKEN=dapi0123456789abcdef" >> .env
```

3. Start the application:
```bash
npm build run
npm start
```

## Example Usage

The magic happens when you prefix your commands with `!`. Here are some examples:

```bash
# Create a Python file
$ !create a python script that implements quicksort

# Set up a project
$ !initialize a new react typescript project

# Git operations
$ !commit all my changes with a message about updating the readme

# File operations
$ !find all TODO comments in javascript files
```

## Common Errors

1. Databricks Authentication:
```bash
Error: Request failed with status code 401
```
Solution: Check your bearer token in `.env` file

2. Model Endpoint:
```bash
Error: Could not reach endpoint
```
Solution: Verify your Databricks endpoint URL and ensure the model is deployed

## Configuring Your Own Model

Replace with your endpoint and token:
```javascript
const response = await fetch(
  process.env.DATABRICKS_ENDPOINT,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DATABRICKS_TOKEN}`,
    },
    // ...
  }
);
```

## Need Help?

- Check your Databricks endpoint status: https://adb-[workspace].azuredatabricks.net
- Verify model deployment in Databricks ML model serving
- Ensure your token has proper permissions
- See logs in developer tools (Ctrl+Shift+I)

## Support

Email: wjfoster2@wisc.edu, ajlang5@wisc.edu, oliver@theohrts.com
