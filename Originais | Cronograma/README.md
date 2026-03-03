# Originais Lumine - Replica Base44

Aplicação web em HTML/CSS/JS com layout e fluxos inspirados no app `originais.base44.app` a partir das capturas enviadas.

## Telas replicadas
- `Dashboard`
- `Cronograma` (Gantt mensal)
- `Projetos` (tabela + filtros + importação CSV)
- `Configurações` (abas por entidade)

## Funcionalidades
- CRUD de projetos (novo, editar, excluir)
- Gantt com edição rápida no gráfico (`◀`, `▶`, `-`, `+` em cada etapa)
- Atalho `+ Novo Projeto` dentro do cronograma
- Dashboard com métricas e gráficos por ano/status/categoria/natureza/duração e tempo médio por etapa
- Configurações globais para categorias, tipos de produção, formatos, naturezas, durações, status e etapas
- Importação do pacote Base44 (9 CSVs de export) na aba Projetos

## Modelo de dados (localStorage)
Chave: `originais_lumine_state_v2`

- `settings.categories[]`
- `settings.productionTypes[]`
- `settings.formats[]`
- `settings.natures[]`
- `settings.durations[]`
- `settings.statuses[]`
- `settings.stages[]` `{ id, name, color }`
- `projects[]`:
  - `{ id, code, title, year, category, productionType, format, nature, duration, status, budget, spent, notes, stages[] }`
  - `stages[]`: `{ id, stageId, start, end }`
- `timeline`: `{ start, end }` (YYYY-MM)

## Importar Base44
1. Clique em `Importar Base44 CSV` na aba `Projetos`.
2. Selecione os arquivos:
   - `Category_export.csv`
   - `Duration_export.csv`
   - `Format_export.csv`
   - `Nature_export.csv`
   - `ProductionType_export.csv`
   - `Project_export.csv`
   - `ProjectStatus_export.csv`
   - `Stage_export.csv`
   - `StageType_export.csv`
3. O app normaliza os relacionamentos e substitui o estado local pela base importada.

## Uso
Abra `index.html` no navegador.
