# 🧟 Frankenstein Project

> Learn. Experiment. Collaborate. Break Things. Build Things.

Welcome to **Frankenstein Project** - a community-driven playground for developers of all skill levels.

This repository was created as a safe environment where newcomers can explore software development, collaborate with other developers, learn Git workflows, experiment with new ideas, and contribute to a living project.

The core of the project is a game, but that doesn't mean you are limited to game development.

## 🎯 Project Philosophy

The Frankenstein Project follows a simple rule:

> If it helps you learn something new, build it.

Developers are encouraged to:

- Create new game features
- Experiment with new technologies
- Practice frontend development
- Practice backend development
- Try new frameworks and libraries
- Learn Git and GitHub collaboration
- Create educational pages
- Develop utility tools
- Build proof-of-concepts

Not every contribution must be related to the game itself.

As long as the code is clean, documented, and separated from the game logic where appropriate, it is welcome.

## 🎮 The Main Project

The primary focus of the repository is maintaining and expanding the game.

Possible areas of contribution:

- New game mechanics
- UI improvements
- Player systems
- Authentication
- Performance improvements
- Multiplayer features
- Database integrations
- Bug fixes
- Testing


## 🚀 Technology Stack

Current technologies may include:

- Next.js
- Supabase

Technology choices may evolve as contributors experiment and learn.

---

# 🌳 Branch Strategy

This repository follows a structured Git workflow.

## Production Branch

```
main
```

Represents the live, production-ready application.

Only thoroughly tested and approved code should reach this branch.

---

## Development Branch

```
dev
```

Primary development branch.

All feature work begins here.

---

## Acceptance Branch

```
acc
```

Acceptance testing environment.

Features that are considered stable are promoted here for validation and testing before production release.

---

# 👨‍💻 Development Workflow

## 1. Create Feature Branch

Start from the development branch.

```shell
git checkout dev
git pull origin dev
git checkout -b feature/user-registration
```

Examples:

```shell
feature/login-page
feature/inventory-system
feature/api-learning-demo
feature/chat-system
```

---

## 2. Develop Your Feature

Build your feature.

Before creating a Pull Request ensure:

- Code compiles successfully
- No unnecessary files are committed
- Tests pass
- Documentation is updated if needed

---

## 3. Create Pull Request to DEV

Create a Pull Request:

```
feature/* → dev
```

A reviewer should verify:

✅ Code quality  
✅ Security considerations  
✅ Architecture  
✅ Naming conventions  
✅ Readability  
✅ Tests passing  
✅ Documentation updates  

When approved, GitHub merges the Pull Request into `dev`.

---

## 4. Promote Features to ACC

When multiple features are finished and considered stable:

Create Pull Request:

```
dev → acc
```

Typically performed by:

- Release Manager
- Tech Lead
- Senior Developer

The ACC environment is used for:

- Feature validation
- Integration testing
- User acceptance testing
- Regression testing

---

## 5. Bug Fix Process

If issues are found in ACC:

Create a fix branch:

```shell
git checkout dev
git checkout -b bugfix/login-validation
```

After approval:

```
bugfix/* → dev
dev → acc
```

ACC is updated and retested.

This cycle continues until testing is successful.

---

## 6. Release to Production

Once ACC testing passes:

Create Pull Request:

```
acc → main
```

After approval:

```
✅ Production Released
```

---

# 🔄 Flow Overview

```
feature/*
     │
     ▼
    dev
     │
     ▼
    acc
     │
     ▼
   main
```

Or visually:

```
Feature Branch
      │
      ▼
     DEV
      │
      ▼
     ACC
      │
      ▼
    PROD
```

---

# 🤝 Contribution Guidelines

Please remember:

- Be respectful
- Help newcomers
- Review code constructively
- Share knowledge
- Ask questions
- Document interesting findings
- Experiment responsibly

There are no stupid questions here.

Everyone started somewhere.

---

# 🧪 Learning Through Building

This repository is not only about shipping software.

It is about:

- Learning Git
- Learning collaboration
- Learning code reviews
- Learning architecture
- Learning DevOps
- Learning cloud technologies
- Learning how real projects evolve

Mistakes are expected.

Learning is required.

---

# 💡 Final Notes

Frankenstein Project is intentionally unconventional.

It may contain a game, educational modules, experiments, prototypes, tutorials, and ideas that have nothing to do with one another.

That's the point.

Build something interesting.  
Learn something new.  
Help somebody else learn.

And most importantly...

**Have fun. 🚀🧟‍♂️** 

DEVS
