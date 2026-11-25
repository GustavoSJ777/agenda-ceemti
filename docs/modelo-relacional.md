# Modelo relacional

Fonte: `database/schema.sql` (original, inalterado). Detalhes de políticas RLS: `docs/auditoria-fase1.md`, seção 3.3.

```mermaid
erDiagram
  PERFIS ||--o| PROFESSORES : "perfil_id"
  PERFIS ||--o| ALUNOS : "perfil_id (set null)"
  SERIES ||--o{ TURMAS : "serie_id (restrict)"
  PROFESSORES ||--o{ PROFESSOR_TURMAS : "professor_id (cascade)"
  TURMAS ||--o{ PROFESSOR_TURMAS : "turma_id (cascade)"
  DISCIPLINAS ||--o{ PROFESSOR_TURMAS : "disciplina_id (restrict)"
  ALUNOS ||--o{ MATRICULAS : "aluno_id (cascade)"
  TURMAS ||--o{ MATRICULAS : "turma_id (restrict)"
  TURMAS ||--o{ EVENTOS : "turma_id (cascade)"
  TURMAS ||--o{ ATIVIDADES : "turma_id (cascade)"
  DISCIPLINAS ||--o{ ATIVIDADES : "disciplina_id (restrict)"
  PROFESSORES ||--o{ ATIVIDADES : "professor_id (set null)"
  ALUNOS ||--o{ RECUPERACOES : "aluno_id (cascade)"
  TURMAS ||--o{ RECUPERACOES : "turma_id (restrict)"
  DISCIPLINAS ||--o{ RECUPERACOES : "disciplina_id (restrict)"
  PERFIS ||--o{ ANOTACOES : "autor_id (cascade)"
  TURMAS ||--o{ AVISOS : "turma_id (cascade)"
```

`auth.users (1) — (1) perfis`: o perfil é criado pela rota de criação de usuário (service role) ou manualmente para o primeiro administrador. `auditoria` é gravada apenas por trigger (perfis, alunos, matriculas, recuperacoes, professor_turmas).
