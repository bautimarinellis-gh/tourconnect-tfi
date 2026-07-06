# AGENTS_RULES.md — Reglas generales de comportamiento

> Archivo genérico. Copiarlo en la raíz de cualquier proyecto.
> Se aplica en combinación con el AGENTS.md específico del proyecto.
> El agente debe leer este archivo antes de ejecutar cualquier tarea.

---

## 1. Antes de arrancar: validar el prompt

Antes de escribir una sola línea de código, revisar que el prompt tenga:

| Elemento          | Pregunta                                       |
|-------------------|------------------------------------------------|
| Objetivo          | ¿Qué se quiere lograr?                         |
| Alcance           | ¿Qué archivos o módulos están en scope?        |
| Criterio de éxito | ¿Cómo se verifica que la tarea está bien hecha? |
| Restricciones     | ¿Qué no se debe tocar o hacer?                 |
| Contexto          | ¿Hay información de fondo necesaria?           |

Si falta alguno en una tarea compleja → avisar antes de avanzar. No asumir. No inventar. Preguntar.

Ejemplo de respuesta cuando falta contexto:
```
Antes de arrancar, necesito confirmar:
- ¿El toggle debe persistir entre sesiones o solo en la sesión actual?
- ¿Hay un sistema de estilos ya definido (CSS variables, Tailwind, etc.)?
```

---

## 2. Pensar antes de codificar

- Listar los pasos del plan antes de ejecutar cualquier tarea de más de 2 archivos.
- Si hay más de una forma válida de resolver algo, presentar las opciones con sus tradeoffs. No elegir en silencio.
- Si algo del proyecto o del pedido no está claro, nombrarlo y preguntar.
- Si el enfoque pedido es más complejo de lo necesario, decirlo antes de implementarlo.

Formato de plan esperado:
```
Plan:
1. [Acción] → verificar: [cómo sé que está bien]
2. [Acción] → verificar: [cómo sé que está bien]
3. [Acción] → verificar: [cómo sé que está bien]
```

---

## 3. Simplicidad primero

- Escribir el mínimo de código que resuelve el problema. Nada especulativo.
- Sin abstracciones para uso único.
- Sin flexibilidad futura que no fue pedida.
- Sin manejo de errores para casos imposibles.
- Si 200 líneas pueden ser 50, reescribir.

**Test:** ¿un desarrollador senior diría que esto está sobreingenieriado? Si sí → simplificar.

---

## 4. Cambios quirúrgicos

- Tocar solo lo que la tarea requiere.
- No mejorar, reformatear ni refactorizar código adyacente.
- Mantener el estilo existente del proyecto aunque sea diferente al preferido.
- Si se detecta un problema no relacionado → mencionarlo al final, no modificarlo.
- Limpiar solo lo que los propios cambios dejan huérfano (imports, variables, funciones).

**Test:** cada línea modificada debe poder trazarse directamente al pedido.

---

## 5. Ejecución orientada a criterios de éxito

Transformar tareas abiertas en objetivos verificables:

| Prompt vago             | Transformar en                                |
|-------------------------|-----------------------------------------------|
| "Agregá validación"     | Tests para inputs inválidos pasan. Nada más.  |
| "Arreglá el bug"        | Test que reproduce el bug → hacerlo pasar.    |
| "Refactorizá X"         | Tests pasan antes y después. Comportamiento idéntico. |
| "Mejorá el rendimiento" | Métrica concreta antes/después. Cambio mínimo. |

Si el prompt no tiene criterio de éxito claro → pedirlo antes de arrancar.

---

## 6. Comunicación al terminar

Al finalizar cada tarea, reportar:

1. Qué se hizo
2. Qué se decidió y por qué (si hubo decisiones no triviales)
3. Qué se dejó afuera intencionalmente
4. Qué merece atención futura (sin haberlo tocado)

Si en el medio de la tarea aparece una decisión no trivial → pausar y consultar antes de seguir.

---

## 7. Lo que nunca hacer

- No modificar archivos marcados como protegidos en el AGENTS.md del proyecto
- No instalar dependencias sin avisar
- No hacer commits o pushes sin instrucción explícita
- No reescribir lógica existente que funciona si la tarea no lo requiere
- No cambiar nombres de variables, funciones o rutas sin que sea parte del pedido
- No eliminar comentarios o código que no se entiende

---

*Este archivo es genérico y no contiene contexto de proyecto.*
*Para contexto específico, ver AGENTS.md en la raíz del repositorio.*