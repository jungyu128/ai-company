# Daily Workflow — Internal AI Company

> 내일 아침부터 이 순서만 따르면 됩니다.  
> 목적: WorkPilot을 **혼자 대화하는 AI보다 높은 품질**로 만들기.

---

## 오늘 할 일 (CEO 3분 시작)

1. Cursor에서 이 채팅을 연다.
2. 한 줄로 말한다 (또는 Cursor command **Enter AI Company** / `/enter-ai-company`):

```text
Enter AI Company
```

또는 목표와 함께:

```text
Enter AI Company. 오늘 WorkPilot 목표: [목표를 한 문장으로]
```

3. Orchestrator가 **먼저 HQ**를 연다 — **primary web UI `/builder/hq`** (또는 `npm run ai-company:enter` → `docs/ai-team/ops/HQ.md`):
   - Current Sprint / Active Agent / Current Task
   - Pending CEO Approvals / Blocked Items / Team Status
   - Recent Decisions / Engineering Health / Release History / Live Activity
   - Recommended Next Mission
4. 그다음 기존 Builder Runtime 그대로:
   - Daily CEO briefing (`docs/ai-team/ops/briefings/`)
   - Task Board / Sprint / Tech debt 확인
   - 새 TASK 생성 (또는 기존 이어하기)
   - `DISCUSS` 시작 → 제안서 → CEO 승인
   - Decision Memory 기록

**금지:** WorkPilot 사용자·Gmail·Calendar·CRM·고객 데이터를 HQ에 표시하지 않음.
---

## Stage 5 — Daily Operations (Builder)

| Cadence | Artifact | Runtime API |
|---------|----------|-------------|
| Daily start | CEO briefing | `buildDailyCeoBriefing` |
| Sprint start | Sprint plan | `validateSprintPlan` |
| After decisions | Decision memory | `validateDecisionMemory` |
| After denials / debt | Improvement backlog | `proposeImprovements` |
| Weekly | Engineering report | `buildWeeklyEngineeringReport` |
| Before ship | Release checklist | `validateReleaseChecklist` |
| Ongoing | Tech debt | `validateTechDebtItem` |

Details: [`docs/ai-team/ops/README.md`](../docs/ai-team/ops/README.md)

---

## 전체 파이프라인 (매일)

| # | 단계 | 담당 | Task status |
|---|------|------|-------------|
| 1 | AI Company 입장 | Orchestrator | — |
| 2 | WorkPilot 과제 생성 | PM | `BACKLOG` → `DISCUSS` |
| 3 | 직원 토론 (도전·반박·대안) | Product, PM, Arch, Eng, QA, Security | `DISCUSS` |
| 4 | 로드맵/범위 | PM | `PLANNED` |
| 5 | 설계 검토 | Architect | `ARCHITECT` |
| 6 | 구현 계획 | Backend / Frontend | (proposal notes) |
| 7 | 테스트 전략 | QA | (proposal notes) |
| 8 | 리스크 검토 | Security | (proposal notes) |
| 9 | 사용자 가치 검토 | Product | (proposal notes) |
| 10 | **CEO 제안 승인** | CEO | `WAITING_CEO` |
| 11 | Claude Code 구현 | Coding agent | `IN_PROGRESS` |
| 12 | 구현 리뷰 | Reviewer + Engineers | → `QA` |
| 13 | QA 검증 | QA | `QA` |
| 14 | Security 검증 | Security | `SECURITY` |
| 15 | **CEO 출고 승인** | CEO | `WAITING_CEO` → `DONE` |

---

## CEO가 말해야 하는 승인 문구

| 언제 | 문구 예시 |
|------|-----------|
| 제안 승인 | `Approve TASK-YYYY-MM-DD-NNN proposal only` |
| 출고 승인 | `Approve TASK-YYYY-MM-DD-NNN only` |
| 범위 제한 | `Approve [scope] only` |

승인 문구 없이 DONE 처리 금지.

---

## 필수 파일

| 용도 | 경로 |
|------|------|
| 입장/조율 | `.cursor-ai/Orchestrator.md` |
| 토론 | `.cursor-ai/DISCUSSION.md` |
| 구현 실행 | `.cursor-ai/CLAUDE_CODE.md` |
| 보드 | `docs/ai-team/TASKS.md` |
| 핸드오프 | `docs/ai-team/handoffs/` |
| Daily ops | `docs/ai-team/ops/` |
| Runtime | `docs/ai-team/runtime/RUNTIME.md` |

---

## 품질 규칙 (짧게)

- 토론에서 **반박 없는 합의는 무효**
- 코드는 제안 CEO 승인 **이후**만
- QA / Security / Reviewer 게이트 생략 금지
- Feature 38 인앱 회사 OS는 아직 아님 — **이 Cursor 회사가 실제 빌더**
