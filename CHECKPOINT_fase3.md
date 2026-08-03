# Checkpoint — después de ejecutar la Fase 3

No es una fase nueva ni arquitectura nueva. Es una verificación mecánica de que
el Builder no se contaminó, antes de conectar el motor (Fase 4). Córrelo cuando
la Fase 3 esté implementada.

---

## 1. ¿El Builder es realmente tonto?

El Builder no debe leer confianza, perfil, tipo de error ni ejes. Solo:
`Objetivo → Receta → Bloques`.

```bash
grep -nE "confianza|confidence|perfil|tipoError|\beje\b|estrategia|strategy" experience/builder/builder.ts
```

**Pasa si:** no hay coincidencias (salvo, como mucho, en un comentario que
explique lo que NO debe hacer). Revisa además los imports de `builder.ts`: solo
debería importar de `../recipes/…` y `../contracts/…` — **nunca** de `../../motor`
(ni `PerfilConcepto`, ni nada de estado del estudiante).

```bash
grep -nE "import|from" experience/builder/builder.ts
```

**Falla si** aparece cualquier `if (confianza…)`, `if (perfil…)`, `if (tipoError…)`
o un import del motor: ahí ya empezó a contaminarse.

---

## 2. ¿La UI depende del Builder y no de la receta?

La pantalla solo recibe una `Experiencia` y renderiza `bloques`. Nunca debe
ramificar por el id de la receta.

```bash
grep -nE "recipe|receta|metadata|\.id ===" "app/(main)/current-objective.tsx"
```

**Pasa si:** no hay coincidencias — la UI consume `experiencia.bloques`, no
`recipe.id`. **Falla si** aparece algo como `if (recipe.id === 'question-first')`.

---

## 3. ¿Los bloques son realmente reutilizables?

Un bloque es un ladrillo genérico (`QuestionBlock`, `pregunta`), nunca atado a un
contenido concreto (`FactorizacionQuestion`).

```bash
grep -rnE "Factoriz|Factor|Trinomio|[A-Z][a-z]+Question|[A-Z][a-z]+Exercise" experience/ "app/(main)/current-objective.tsx"
```

**Pasa si:** los bloques/componentes se nombran por su tipo genérico y el render
elige por `bloque.tipo`, no por el concepto. **Falla si** hay un componente con
nombre de tema.

---

## 4. ¿La experiencia realmente "se siente"?

Este no es grep — es mirar. Con `MOTOR_MODE = true`, abre la pantalla, toca
"Comenzar", saca un screenshot y júzgalo contra esta rúbrica:

- [ ] Se ve **un único objetivo** (no un menú ni un dashboard).
- [ ] Hay un **titular WOW** ("Ya sabemos cómo ayudarte…"), no un encabezado técnico.
- [ ] La secuencia de bloques **se lee como una misión** (📖 → ❓ → 📝), no como
      una lista de debug.
- [ ] Al mirarla, la sensación es "esto es el nuevo NEMUP", no "esto es un
      listado técnico".

**Si la respuesta es "todavía parece un listado técnico":** mejora la
representación visual *antes* de conectar el motor (Fase 4). Es más barato
pulir la sensación con contenido falso que con el motor ya enganchado.

---

## Veredicto

- Chequeos 1–3 en verde → la arquitectura está limpia, el Builder es tonto, los
  bloques son ladrillos. Luz verde técnica para la Fase 4.
- Chequeo 4 en verde → la apuesta de experiencia va bien encaminada.
- Cualquiera en rojo → arréglalo aquí, no en la Fase 4 (contaminar la Fase 4 con
  deuda de la 3 es mucho más caro).
