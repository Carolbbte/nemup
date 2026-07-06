# OCR Engine

## Estado actual

**Fase 1 — Arquitectura base.** Este módulo contiene únicamente contratos y
la forma de las clases. No hay ninguna lógica de extracción implementada:
todo método público lanza `Error("Not implemented")`. El backend actual
(`services/transcriptionService.ts`, `services/generationService.ts`,
`services/knowledgeExtractor.ts`) **no ha sido modificado** y sigue
funcionando exactamente igual que antes de crear este módulo.

## Propósito

Reemplazar, en fases futuras, la extracción de contenido "texto plano" que
hoy hace `transcriptionService.ts` por un modelo de documento **estructurado**
(páginas → bloques tipados: texto, imagen, fórmula, tabla) que las capas de
Knowledge Engine, Learning Engine y Generation Engine puedan consumir sin
tener que volver a parsear un string.

## Responsabilidades (una vez implementado)

- Determinar si un documento es digital, escaneado o una foto.
- Elegir la estrategia de extracción correcta según ese tipo (`OCRFactory`).
- Extraer el contenido de un documento preservando su estructura: páginas,
  bloques, orden de lectura y geometría (`DocumentStructure`).
- Especializar regiones detectadas en bloques tipados: imágenes, fórmulas y
  tablas (no solo texto).
- Normalizar y validar el resultado antes de entregarlo.
- Registrar métricas de tiempo y volumen por corrida, para observabilidad y
  control de costo.

## Responsabilidades que NO tiene

- **No** decide qué contenido es pedagógicamente relevante — eso es trabajo
  del Knowledge Engine / `pedagogicalClassifier`.
- **No** genera preguntas, tarjetas, misiones ni ningún contenido de
  aprendizaje — eso es trabajo de `GenerationService`.
- **No** decide qué tipo de sesión generar — eso es trabajo del
  `SessionDecisionEngine`.
- **No** contiene prompts de IA ni lógica pedagógica de ningún tipo.
- **No** reemplaza nada del pipeline actual todavía — mientras no exista una
  Fase de integración explícita, `transcriptionService.ts` sigue siendo la
  única fuente de transcripción usada por el backend.

## Arquitectura interna

```
OCRService                    ← único punto de entrada público
   ├─ OCRFactory               ← elige la estrategia (Factory pattern)
   │    └─ IDocumentExtractor   ← puerto que implementan las estrategias:
   │         ├─ DigitalPdfExtractor   (texto embebido, sin costo de IA)
   │         └─ OcrExtractor          (Vision/OCR, delega bloques especializados)
   │              └─ IBlockExtractor<TBlock>  ← puerto de especialistas de bloque:
   │                   ├─ ImageExtractor   → produce ImageBlock
   │                   ├─ FormulaExtractor → produce FormulaBlock
   │                   └─ TableExtractor   → produce TableBlock
   ├─ DocumentNormalizer       ← limpia el DocumentStructure extraído
   ├─ DocumentValidator        ← valida invariantes estructurales
   └─ OCRMetrics               ← observa tiempo/volumen de la corrida
```

`IDocumentExtractor` e `IBlockExtractor` son puertos distintos a propósito:
el primero opera sobre un documento completo y se elige una sola vez por
request (Factory); el segundo opera sobre una región ya detectada dentro de
una página y es usado internamente por los extractores de documento — tratar
ambos con la misma interfaz violaría Liskov Substitution.

El grafo de dependencias de `contracts/` es unidireccional y no tiene
ciclos: `enums → BoundingBox → BlockStructure → {ImageBlock, FormulaBlock,
TableBlock} → PageStructure → DocumentStructure → OCRResult`.

## Flujo esperado (una vez implementado)

1. `OCRService.process(request: OCRRequest)` recibe el buffer del archivo.
2. `OCRFactory.createExtractor(request)` decide qué `IDocumentExtractor`
   usar, según `DocumentSourceType`/`DocumentType`.
3. El extractor elegido produce un `DocumentStructure` crudo, delegando
   regiones de imagen/fórmula/tabla a los `IBlockExtractor` correspondientes.
4. `DocumentNormalizer.normalize(...)` limpia el resultado.
5. `DocumentValidator.validate(...)` confirma que cumple los invariantes
   estructurales antes de entregarlo.
6. `OCRMetrics` registra duración, páginas y bloques de la corrida.
7. `OCRService` devuelve un `OCRResult` con el `DocumentStructure` final (o
   los errores encontrados).

## Fases futuras (fuera de alcance de esta fase)

- **Fase 2** — Implementar `DigitalPdfExtractor` (extracción de texto nativo,
  equivalente al `pdf-parse` actual, sin costo de IA).
- **Fase 3** — Implementar `OcrExtractor` (integración real con un proveedor
  de Vision/OCR).
- **Fase 4** — Implementar `ImageExtractor`, `FormulaExtractor` y
  `TableExtractor`.
- **Fase 5** — Implementar `DocumentNormalizer`.
- **Fase 6** — Implementar `DocumentValidator`.
- **Fase 7** — Implementar `OCRMetrics` y observabilidad de costo.
- **Fase 8** — Integrar `OCRService` como reemplazo de
  `transcriptionService.ts` en `routes/sessions.ts`, y adaptar
  `KnowledgeExtractor`/`GenerationService` para consumir `DocumentStructure`
  en vez de un string plano. Ninguna de estas integraciones existe todavía.
