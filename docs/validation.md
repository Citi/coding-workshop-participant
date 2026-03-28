# Coding Workshop - Validation Guide

> [Main Guide](./README.md) | **Validation Guide** | [Evaluation Guide](./evaluation.md) | [Testing Guide](./testing.md) | [Implementation Guide](./implementation.md)

## Overview

This validation guide will take you through the steps required to configure your virtual desktop infrastructure (VDI) and ensure all the requirements are set for you to begin working on your submission for this coding workshop.

### About VDI

The VDI is a virtual desktop computer built and packaged with software to use during the duration of this workshop. You can treat it as a personal computer that will disappear in a few days, but continue to be mindful of your personal data while you use it.

Details such as your credentials for online accounts (e.g. GitHub, Google, etc.) will be stored for the length of the workshop and completely erased shortly after the conclusion of the workshop.

If you are using the [WorkSpaces Client](https://clients.amazonworkspaces.com/), you will be able to share clipboard between your personal computer and your VDI. Meaning, if you can copy commands in this doc from your web browser in your personal computer and paste them in your virtual desktop with `Ctrl+V` or `Ctrl+Shift+V` if you are pasting in the terminal. It also works the other way around.

### Troubleshooting

If you believe any of the instructions below do not work as we intended, please bring it up with the workshop organizer(s). They will be happy to guide you through some steps to fix your dev environment.

## Setting Up Your VDI

Login to your VDI desktop and open a new Terminal from the applications menu (9-dot icon at the bottom of your desktop) and clone this repo with

```sh
git clone https://github.com/eistrati/coding-workshop-participant
```

Change the active path to the project's directory.

```sh
cd coding-workshop-participant
```

Setup your Participant ID and Participant Code as environment variables.

```sh
export PARTICIPANT_ID=your-id
export PARTICIPANT_CODE=your-code
```

Change `your-id` with your Participant ID and `your-code` with your Participant Code that you received over email from workshop organizer(s).

Now in the terminal run:

```sh
./bin/setup-participant.sh
```

Then run the setup-environment script to install the tools required for this workshop automatically with:

```sh
./bin/setup-environment.sh && source ~/.bashrc
```

**Note:** The script will ask you for your `sudo` password. This is the same password you used to login to the VDI. The terminal will not show any characters to protect your password, thus, just press `Enter` after typing your password or after pasting it if you copied it from somewhere.

This will install tools to help you code during this work shop, such as:

- Visual Studio Code
- PyCharm
- IntelliJ

Among other utilities to help you deploy your code to AWS (e.g. awscli, terraform).

As such, please allow some time for the script to finish installing everything before attempting to stop it.

## Understanding Repository Structure

```
coding-workshop-participant/
├── backend/                 # Python backend
│   ├── achievements/          # CRUD service for achievements
│   ├── individuals/           # CRUD service for individuals
│   ├── metadata/              # CRUD service for metadata
│   ├── teams/                 # CRUD service for teams
│   └── README.md              # Backend guide
├── bin/                     # Shell scripts
│   ├── clean-up.sh            # Clean up deployment script
│   ├── deploy-backend.sh      # Backend infrastructure deployment script
│   ├── deploy-frontend.sh     # Frontend application deployment script
│   ├── generate-env.sh        # Generate frontend environment script
│   ├── proxy-server.js        # CORS-enabled proxy server script
│   ├── setup-environment.sh   # Setup environment script
│   ├── setup-participant.sh   # Setup participant script
│   ├── start-dev.sh           # Local environment startup script
│   └── README.md              # Shell scripts guide
├── docs/                    # Documentation
│   ├── README.md              # Main guide
│   ├── evaluation.md          # Evaluation guide
│   ├── implementation.md      # Implementation guide
│   ├── testing.md             # Testing guide
│   └── validation.md          # Validation guide (YOU ARE HERE)
├── frontend/                # React frontend
│   ├── public/                # Public assets
│   ├── src/                   # Source code
│   ├── package.json           # Application metadata
│   └── README.md              # Frontend guide
└── infra/                   # Terraform infrastructure
    ├── cloudfront.tf          # CloudFront distribution
    ├── data.tf                # Data sources
    ├── documentdb.tf          # DocumentDB serverless cluster
    ├── lambda.tf              # Lambda functions
    ├── locals.tf              # Local values
    ├── main.tf                # Main resources
    ├── output.tf              # Output values
    ├── policy.tftpl           # IAM policy template
    ├── provider.tf            # Provider configurations
    ├── s3.tf                  # S3 bucket
    ├── variable.tf            # Input variables
    └── README.md              # Infrastructure guide
```

## Configuring Your Dev Tools

### Visual Studio Code

**Note:** The first time you launch VS Code, it will take a lot longer than subsequent launches.

VS Code comes pre installed with GitHub Copilot, which you will be allowed to use during this workshop. To enable it, login to your personal GitHub account. This will also leave you connected to your GitHub account for when you push your work for review.

Now open the project by going to File -> Open Folder... You should find the project in your Home directory. Once open you will be ready to proceed to the next section.

### PyCharm & IntelliJ

Both of these IDEs can be used to complete this workshop, but they do not have GitHub Copilot pre installed, so you will need to install the plugin by going to File (top left menu) -> Settings -> Plugins -> Marketplace and searching for "GitHub Copilot". Install the extension and restart the app when prompted. Upon entering PyCharm/IntelliJ again, login to your personal GitHub account to enable GitHub Copilot.

Now we will login to GitHub to ensure you can push your code there when you make updates to your code.
Go to File -> Settings -> Version Control -> GitHub and add your account. You can login using the browser.

Next open the project by going to File -> Open. You should find the project in your Home directory. Once open you will be ready to proceed to the next section.

### With Open Project

Next, we will prepare our Python environment so the dependencies you use for this project don't clash with any dependencies used by Ubuntu to the OS. To do this, just run

```sh
python3.11 -m venv .venv && source .venv/bin/activate
```

Notice the `(venv)` appearing in your terminal now. This indicates all your Python dependencies will be stored and loaded from this project, and you should ensure the marker is present when you run any python code for the workshop.

Now we will start your local development environment by running:

```sh
./bin/start-dev.sh
```

This will ensure all of your dependencies are running, including the backend services and the front end service.

If everything goes well, you are now ready to begin coding.

Now continue reading the other docs we have prepared for you and familiarize yourself with the codebase.

## Navigation Links

<nav aria-label="breadcrumb">
  <ol>
    <li><a href="./README.md">Main Guide</a></li>
    <li aria-current="page">Validation Guide</li>
    <li><a href="./evaluation.md">Evaluation Guide</a></li>
    <li><a href="./testing.md">Testing Guide</a></li>
    <li><a href="./implementation.md">Implementation Guide</a></li>
  </ol>
</nav>
