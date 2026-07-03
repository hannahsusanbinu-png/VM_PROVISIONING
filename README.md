# VM Provisioning Simulator

A browser-based virtual machine provisioning simulator that models the lifecycle of creating and monitoring VMs on a single physical host.

## Overview

This project simulates the following workflow:

- Host resource overview (CPU, RAM, storage)
- VM configuration with OS, CPU, RAM, storage, and networking options
- Validation against available host resources
- Resource allocation and provisioning steps
- Live monitoring and reporting
- Multi-VM provisioning support with resource tracking

## Features

- Real-time host resource display
- VM deployment validation and allocation logic
- Multi-screen simulation flow with progress tracking
- Provisioning animation and stage updates
- VM inventory sidebar for provisioned machines
- Final report summary of provisioned resources and uptime

## Files

- `index.html` - Application markup and screen structure
- `style.css` - Styling for the simulator UI
- `app.js` - Core simulation logic, state management, validation, allocation, and monitoring
- `README.md` - Project documentation

## How to Run

1. Open `index.html` in a modern web browser.
2. Click **Launch Simulator** to begin.
3. Use the sidebar and navigation buttons to move through the provisioning flow.
4. Configure a VM, validate resources, allocate resources, and watch the provisioning stages.
5. View the final report and optionally provision another VM.

## Notes

- This is a static front-end simulator and does not provision real virtual machines.
- All host and VM resources are simulated in-browser using JavaScript state management.
- The project is designed for demonstration and learning purposes.

## License

This repository does not include a specific license. Use or modify the code as needed for personal or educational projects.
