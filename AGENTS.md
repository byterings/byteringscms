# AI Agent Operating Guide

## 🔴 Mandatory Read Order (STRICT)
1. README.md
2. context.md
3. project_status.md
4. roadmap.md

---

## 🧠 Source of Truth Rules
Priority:
1. Code
2. project_status.md
3. context.md
4. roadmap.md

- NEVER assume roadmap items are implemented
- If conflict → trust code

---

## 📂 File Responsibilities

### context.md
System architecture and understanding

### roadmap.md
Planned work

### project_status.md
Actual implementation state

---

## ⚙️ Execution Rules

### Before starting:
- Match task with roadmap
- Verify in project_status.md

### After completing:
- Update project_status.md
- Update context.md (if needed)
- Update README.md (if needed)

---

## 🔐 File Access & Modification Rules

### 📖 Read Access
- Full access to all files (code, DB, configs)

### ✏️ Write Access
❗ Requires user approval

### 🛑 Approval Flow
Before changes:
- List files
- Explain changes
- Ask: "Proceed?"

### ✅ After Approval
- Apply changes
- Update docs

### 🚫 Without Approval
- Only suggest changes
- Do not modify files

### ⚠️ DB Changes
Must explicitly warn before execution

---

## ✅ Task Checklist
- Code correct
- Matches roadmap
- Docs updated
