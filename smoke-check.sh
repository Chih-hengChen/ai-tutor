#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== AI Tutor Skill Smoke Check ==="
echo "Skill dir: $SKILL_DIR"
echo ""

echo "--- 1. Required files exist ---"
for f in SKILL.md README.md knowledge-mode.md project-mode.md codebase-mode.md deep-dive-mode.md visual-aids.md .editorconfig .gitattributes; do
  if [ -f "$SKILL_DIR/$f" ]; then
    echo "  OK  $f"; ok
  else
    fail "$f missing"; fail "$f"
  fi
done

echo ""
echo "--- 2. SKILL.md frontmatter ---"
if head -5 "$SKILL_DIR/SKILL.md" | grep -q "^name: ai-tutor"; then
  echo "  OK  name: ai-tutor"; ok
else
  fail "SKILL.md frontmatter missing 'name: ai-tutor'"
fi

if head -5 "$SKILL_DIR/SKILL.md" | grep -q "^description:"; then
  echo "  OK  description present"; ok
else
  fail "SKILL.md frontmatter missing 'description'"
fi

echo ""
echo "--- 3. No hardcoded Unix-only commands ---"
if grep -n "tree -I" "$SKILL_DIR/codebase-mode.md" 2>/dev/null; then
  fail "codebase-mode.md still has hardcoded 'tree -I' command"
else
  echo "  OK  no hardcoded 'tree -I'"; ok
fi

if grep -rn '~/.claude/skills/ai-tutor/' "$SKILL_DIR/SKILL.md" 2>/dev/null; then
  fail "SKILL.md still has hardcoded Unix absolute path"
else
  echo "  OK  no hardcoded Unix absolute paths in SKILL.md"; ok
fi

echo ""
echo "--- 4. No hardcoded platform-specific paths in sub-files ---"
found_unix_path=false
for f in knowledge-mode.md project-mode.md codebase-mode.md visual-aids.md; do
  if grep -q '~/.claude/' "$SKILL_DIR/$f" 2>/dev/null; then
    fail "$f has hardcoded ~/.claude/ path"
    found_unix_path=true
  fi
done
if [ "$found_unix_path" = false ]; then
  echo "  OK  sub-files have no hardcoded Unix paths"; ok
fi

echo ""
echo "--- 5. Required sections in SKILL.md ---"
for section in "启动流程" "间隔复习" "记录文件格式" "共享约束"; do
  if grep -q "$section" "$SKILL_DIR/SKILL.md"; then
    echo "  OK  section '$section' present"; ok
  else
    fail "SKILL.md missing section '$section'"
  fi
done

echo ""
echo "--- 6. UTF-8 BOM check ---"
has_bom=false
for f in "$SKILL_DIR"/*.md; do
  first_bytes=$(head -c 3 "$f" | od -A n -t x1 | tr -d ' ')
  if [ "$first_bytes" = "efbbb f" ] || [ "$first_bytes" = "efbbbf" ] || echo "$first_bytes" | grep -q "^efbbbf"; then
    fail "$(basename "$f") has UTF-8 BOM"
    has_bom=true
  fi
done
if [ "$has_bom" = false ]; then
  echo "  OK  no BOM in markdown files"; ok
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
