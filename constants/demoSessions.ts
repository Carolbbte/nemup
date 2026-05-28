export type DemoOption = { id: string; text: string };

export type DemoQuestion = {
  id: string;
  text: string;
  options: DemoOption[];
  correctOptionId: string;
  explanation: string;
  sourceQuote: string;
  sourcePage: number;
};

export type DemoSession = {
  subjectId: string;
  subjectName: string;
  subjectEmoji: string;
  topic: string;
  sourceText: string;
  questions: [DemoQuestion, DemoQuestion, DemoQuestion];
};

const SESSIONS: Record<string, DemoSession> = {

  biology: {
    subjectId: 'biology', subjectName: 'Biología', subjectEmoji: '🧬',
    topic: 'La célula: unidad básica de la vida',
    sourceText: 'La célula es la unidad estructural y funcional de todos los seres vivos. Las células se clasifican en procariotas, que carecen de núcleo con membrana propia (como las bacterias), y eucariotas, que poseen un núcleo delimitado por membrana. Las células vegetales se distinguen de las animales por la presencia de pared celular rígida, cloroplastos y una vacuola central de gran tamaño.',
    questions: [
      {
        id: 'bio_q1', sourcePage: 1,
        text: '¿Qué es la célula según la biología moderna?',
        options: [
          { id: 'A', text: 'El órgano más pequeño del cuerpo' },
          { id: 'B', text: 'La unidad estructural y funcional de todos los seres vivos' },
          { id: 'C', text: 'El tejido que forma los órganos' },
        ],
        correctOptionId: 'B',
        explanation: 'La célula es la unidad básica de la vida. Todos los organismos, desde bacterias hasta seres humanos, están formados por células.',
        sourceQuote: 'La célula es la unidad estructural y funcional de todos los seres vivos.',
      },
      {
        id: 'bio_q2', sourcePage: 1,
        text: '¿Cuál es la diferencia principal entre células procariotas y eucariotas?',
        options: [
          { id: 'A', text: 'Las procariotas tienen núcleo con membrana propia' },
          { id: 'B', text: 'Las eucariotas no tienen material genético' },
          { id: 'C', text: 'Las procariotas carecen de núcleo delimitado por membrana' },
          { id: 'D', text: 'Las eucariotas son más pequeñas que las procariotas' },
        ],
        correctOptionId: 'C',
        explanation: 'Las bacterias (procariotas) tienen su ADN libre en el citoplasma. Las células animales y vegetales (eucariotas) tienen el ADN encerrado en un núcleo con membrana.',
        sourceQuote: 'Las células se clasifican en procariotas, que carecen de núcleo con membrana propia, y eucariotas, que poseen un núcleo delimitado por membrana.',
      },
      {
        id: 'bio_q3', sourcePage: 2,
        text: 'Una célula tiene pared celular rígida, cloroplastos y vacuola central grande. ¿Qué tipo de célula es?',
        options: [
          { id: 'A', text: 'Célula animal' },
          { id: 'B', text: 'Bacteria (procariota)' },
          { id: 'C', text: 'Célula vegetal' },
          { id: 'D', text: 'Glóbulo rojo' },
        ],
        correctOptionId: 'C',
        explanation: 'Las tres estructuras son exclusivas de las células vegetales. Las células animales no tienen pared celular ni cloroplastos, y su vacuola es pequeña.',
        sourceQuote: 'Las células vegetales se distinguen de las animales por la presencia de pared celular rígida, cloroplastos y una vacuola central de gran tamaño.',
      },
    ],
  },

  history: {
    subjectId: 'history', subjectName: 'Historia', subjectEmoji: '📜',
    topic: 'La Revolución Francesa: causas y estallido',
    sourceText: 'La Revolución Francesa (1789) transformó profundamente la sociedad europea. Sus causas principales fueron la grave crisis económica del Estado, las profundas desigualdades del sistema estamental —donde la nobleza y el clero gozaban de privilegios y no pagaban impuestos—, el hambre del pueblo y las ideas ilustradas que cuestionaban el poder absoluto del rey. El 14 de julio de 1789 el pueblo de París tomó la Bastilla, símbolo del absolutismo monárquico, marcando el inicio del proceso revolucionario.',
    questions: [
      {
        id: 'his_q1', sourcePage: 1,
        text: '¿En qué año comenzó la Revolución Francesa?',
        options: [
          { id: 'A', text: '1776' },
          { id: 'B', text: '1789' },
          { id: 'C', text: '1804' },
        ],
        correctOptionId: 'B',
        explanation: 'La Revolución Francesa comenzó en 1789. Ese mismo año, el 14 de julio, el pueblo tomó la Bastilla, evento que marca simbólicamente su inicio.',
        sourceQuote: 'La Revolución Francesa (1789) transformó profundamente la sociedad europea.',
      },
      {
        id: 'his_q2', sourcePage: 1,
        text: '¿Por qué la nobleza y el clero generaban resentimiento en el pueblo llano?',
        options: [
          { id: 'A', text: 'Porque realizaban trabajos más pesados' },
          { id: 'B', text: 'Porque gozaban de privilegios y no pagaban impuestos' },
          { id: 'C', text: 'Porque apoyaban las ideas ilustradas' },
          { id: 'D', text: 'Porque controlaban el ejército directamente' },
        ],
        correctOptionId: 'B',
        explanation: 'El Tercer Estado (el pueblo) soportaba toda la carga fiscal mientras nobleza y clero estaban exentos de impuestos. Esta injusticia fue una de las principales causas del estallido revolucionario.',
        sourceQuote: 'la nobleza y el clero gozaban de privilegios y no pagaban impuestos',
      },
      {
        id: 'his_q3', sourcePage: 2,
        text: '¿Qué representaba la Bastilla para el pueblo francés en 1789?',
        options: [
          { id: 'A', text: 'El palacio donde vivía la familia real' },
          { id: 'B', text: 'El centro de las reuniones ilustradas' },
          { id: 'C', text: 'El símbolo del absolutismo monárquico' },
          { id: 'D', text: 'El mercado principal de París' },
        ],
        correctOptionId: 'C',
        explanation: 'La Bastilla era una fortaleza-prisión donde el rey encarcelaba a sus opositores sin juicio. Su toma simbolizó el rechazo popular al poder absoluto del monarca.',
        sourceQuote: 'el pueblo de París tomó la Bastilla, símbolo del absolutismo monárquico',
      },
    ],
  },

  chemistry: {
    subjectId: 'chemistry', subjectName: 'Química', subjectEmoji: '🔬',
    topic: 'La tabla periódica: organización de los elementos',
    sourceText: 'La tabla periódica organiza los 118 elementos químicos conocidos según su número atómico, es decir, la cantidad de protones en el núcleo. Los elementos se distribuyen en 7 periodos (filas horizontales) y 18 grupos (columnas verticales). Los elementos de un mismo grupo comparten propiedades químicas similares porque tienen igual número de electrones de valencia. Los metales, ubicados a la izquierda, son buenos conductores de electricidad; los no metales, a la derecha, generalmente no conducen electricidad.',
    questions: [
      {
        id: 'chem_q1', sourcePage: 1,
        text: '¿Qué propiedad determina la posición de un elemento en la tabla periódica?',
        options: [
          { id: 'A', text: 'Su masa atómica' },
          { id: 'B', text: 'Su número atómico (cantidad de protones)' },
          { id: 'C', text: 'Su color en estado sólido' },
        ],
        correctOptionId: 'B',
        explanation: 'El número atómico, que indica cuántos protones tiene el núcleo, es el criterio de organización de la tabla periódica moderna. A mayor número atómico, mayor posición en la tabla.',
        sourceQuote: 'La tabla periódica organiza los 118 elementos químicos conocidos según su número atómico, es decir, la cantidad de protones en el núcleo.',
      },
      {
        id: 'chem_q2', sourcePage: 1,
        text: '¿Por qué los elementos del mismo grupo tienen propiedades químicas similares?',
        options: [
          { id: 'A', text: 'Porque tienen el mismo número de protones' },
          { id: 'B', text: 'Porque tienen igual número de electrones de valencia' },
          { id: 'C', text: 'Porque pertenecen al mismo periodo' },
          { id: 'D', text: 'Porque tienen la misma masa atómica' },
        ],
        correctOptionId: 'B',
        explanation: 'Los electrones de valencia (en la última capa de energía) son los que participan en las reacciones químicas. Al tener el mismo número, los elementos del grupo reaccionan de forma similar.',
        sourceQuote: 'Los elementos de un mismo grupo comparten propiedades químicas similares porque tienen igual número de electrones de valencia.',
      },
      {
        id: 'chem_q3', sourcePage: 2,
        text: 'Un elemento desconocido se ubica a la derecha de la tabla periódica. ¿Qué propiedad es más probable que tenga?',
        options: [
          { id: 'A', text: 'Alta conductividad eléctrica y brillo metálico' },
          { id: 'B', text: 'Alta densidad y dureza extrema' },
          { id: 'C', text: 'Baja conductividad eléctrica' },
          { id: 'D', text: 'Punto de fusión muy elevado' },
        ],
        correctOptionId: 'C',
        explanation: 'Los elementos de la derecha son no metales. A diferencia de los metales (izquierda), los no metales generalmente no conducen la electricidad.',
        sourceQuote: 'los no metales, a la derecha, generalmente no conducen electricidad',
      },
    ],
  },

  math: {
    subjectId: 'math', subjectName: 'Matemáticas', subjectEmoji: '📐',
    topic: 'Ecuaciones de primer grado',
    sourceText: 'Una ecuación de primer grado es una igualdad que contiene una incógnita (variable) elevada a la potencia 1. Para resolverla se aplica el principio de equivalencia: cualquier operación realizada en un lado de la igualdad debe hacerse también en el otro, para mantener el equilibrio. El objetivo es despejar la incógnita dejándola sola en un lado. Por ejemplo, en 2x + 5 = 13, se resta 5 en ambos lados (2x = 8) y luego se divide por 2, obteniendo x = 4.',
    questions: [
      {
        id: 'math_q1', sourcePage: 1,
        text: '¿Qué significa "despejar la incógnita" en una ecuación?',
        options: [
          { id: 'A', text: 'Multiplicar ambos lados por cero' },
          { id: 'B', text: 'Dejar la variable sola en un lado de la ecuación' },
          { id: 'C', text: 'Eliminar todos los números del problema' },
        ],
        correctOptionId: 'B',
        explanation: 'Despejar significa aislar la incógnita (x) en un lado de la igualdad para conocer su valor. Es el objetivo de cualquier ecuación.',
        sourceQuote: 'El objetivo es despejar la incógnita dejándola sola en un lado.',
      },
      {
        id: 'math_q2', sourcePage: 1,
        text: 'Resuelve: 3x − 4 = 11. ¿Cuánto vale x?',
        options: [
          { id: 'A', text: 'x = 3' },
          { id: 'B', text: 'x = 7' },
          { id: 'C', text: 'x = 5' },
          { id: 'D', text: 'x = 15' },
        ],
        correctOptionId: 'C',
        explanation: '3x − 4 = 11 → suma 4 en ambos lados → 3x = 15 → divide por 3 → x = 5. Principio de equivalencia: misma operación en ambos lados.',
        sourceQuote: 'cualquier operación realizada en un lado de la igualdad debe hacerse también en el otro',
      },
      {
        id: 'math_q3', sourcePage: 2,
        text: 'Si 5(x − 2) = 3x + 4, ¿cuál es el valor de x?',
        options: [
          { id: 'A', text: 'x = 3' },
          { id: 'B', text: 'x = 5' },
          { id: 'C', text: 'x = 7' },
          { id: 'D', text: 'x = −7' },
        ],
        correctOptionId: 'C',
        explanation: 'Distribuye: 5x − 10 = 3x + 4. Pasa 3x al lado izquierdo: 2x − 10 = 4. Suma 10: 2x = 14. Divide por 2: x = 7.',
        sourceQuote: 'cualquier operación realizada en un lado de la igualdad debe hacerse también en el otro',
      },
    ],
  },

  spanish: {
    subjectId: 'spanish', subjectName: 'Lenguaje', subjectEmoji: '📝',
    topic: 'El texto: idea principal e ideas secundarias',
    sourceText: 'En un texto expositivo, la idea principal es el concepto central que el autor desea comunicar. Las ideas secundarias complementan, ejemplifican o amplían la idea principal. La idea principal puede ser explícita —aparece directamente escrita en el texto— o implícita —debe inferirse a partir de las ideas secundarias—. Para identificarla, conviene preguntarse: ¿de qué trata principalmente este párrafo? Un buen lector distingue ambos tipos y comprende cómo se relacionan para dar sentido al texto.',
    questions: [
      {
        id: 'spa_q1', sourcePage: 1,
        text: '¿Qué es la idea principal de un texto?',
        options: [
          { id: 'A', text: 'Los ejemplos que usa el autor para ilustrar' },
          { id: 'B', text: 'El concepto central que el autor desea comunicar' },
          { id: 'C', text: 'El último párrafo del texto' },
        ],
        correctOptionId: 'B',
        explanation: 'La idea principal es el eje del texto: aquello que el autor quiere que el lector comprenda por encima de todo lo demás. Los ejemplos y detalles sirven para apoyarla.',
        sourceQuote: 'la idea principal es el concepto central que el autor desea comunicar',
      },
      {
        id: 'spa_q2', sourcePage: 1,
        text: '¿Cuál pregunta te ayuda a identificar la idea principal de un párrafo?',
        options: [
          { id: 'A', text: '¿Cuántas palabras tiene el párrafo?' },
          { id: 'B', text: '¿Qué ejemplos menciona el autor?' },
          { id: 'C', text: '¿De qué trata principalmente este párrafo?' },
          { id: 'D', text: '¿Cuántos adjetivos contiene el texto?' },
        ],
        correctOptionId: 'C',
        explanation: 'Preguntarse por el tema central del párrafo orienta la búsqueda de la idea principal. Los ejemplos y detalles son ideas secundarias que la apoyan.',
        sourceQuote: 'Para identificarla, conviene preguntarse: ¿de qué trata principalmente este párrafo?',
      },
      {
        id: 'spa_q3', sourcePage: 1,
        text: 'Un párrafo no tiene ninguna oración que resuma directamente el tema. El lector debe inferirla de los detalles. ¿Cómo se llama este tipo de idea principal?',
        options: [
          { id: 'A', text: 'Idea principal explícita' },
          { id: 'B', text: 'Idea secundaria' },
          { id: 'C', text: 'Idea principal implícita' },
          { id: 'D', text: 'Idea temática' },
        ],
        correctOptionId: 'C',
        explanation: 'Cuando la idea principal no está escrita directamente, sino que debe deducirse de las ideas secundarias, se dice que es implícita. El lector debe "construirla" a partir del texto.',
        sourceQuote: 'implícita —debe inferirse a partir de las ideas secundarias—',
      },
    ],
  },

  english: {
    subjectId: 'english', subjectName: 'Inglés', subjectEmoji: '🌐',
    topic: 'El verbo to be: ser y estar en inglés',
    sourceText: 'El verbo "to be" (ser/estar) es fundamental en inglés. Se conjuga así: I am, You are, He/She/It is, We/They/You are. Para formar oraciones negativas se agrega "not" después del verbo: I am not, She is not (she isn\'t). Para hacer preguntas se invierte el orden del sujeto y el verbo: Are you a student? Is she happy? El verbo "to be" también se usa para describir características, estados y ubicaciones.',
    questions: [
      {
        id: 'eng_q1', sourcePage: 1,
        text: '¿Cómo se conjuga el verbo "to be" para "He" (él)?',
        options: [
          { id: 'A', text: 'He am' },
          { id: 'B', text: 'He are' },
          { id: 'C', text: 'He is' },
        ],
        correctOptionId: 'C',
        explanation: 'Para la tercera persona del singular (He, She, It) el verbo "to be" se conjuga como "is". Por ejemplo: "He is a student." (Él es estudiante.)',
        sourceQuote: 'He/She/It is',
      },
      {
        id: 'eng_q2', sourcePage: 1,
        text: '¿Cómo se forma una oración negativa con el verbo "to be"?',
        options: [
          { id: 'A', text: 'Se agrega "no" antes del sujeto' },
          { id: 'B', text: 'Se agrega "not" después del verbo "to be"' },
          { id: 'C', text: 'Se cambia el verbo por "don\'t"' },
          { id: 'D', text: 'Se pone "not" al inicio de la oración' },
        ],
        correctOptionId: 'B',
        explanation: '"Not" va inmediatamente después de "to be" para negar. Ej: "She is not happy" o su contracción "she isn\'t happy". No se usa "don\'t/doesn\'t" con "to be".',
        sourceQuote: 'Para formar oraciones negativas se agrega "not" después del verbo: I am not, She is not',
      },
      {
        id: 'eng_q3', sourcePage: 2,
        text: 'Transforma a pregunta: "They are students." ¿Cuál es la forma correcta?',
        options: [
          { id: 'A', text: 'They students are?' },
          { id: 'B', text: 'Do they are students?' },
          { id: 'C', text: 'Are they students?' },
          { id: 'D', text: 'Students are they?' },
        ],
        correctOptionId: 'C',
        explanation: 'Con "to be" se invierte el sujeto y el verbo para preguntar: "Are they students?" No se usa "do/does" con "to be".',
        sourceQuote: 'Para hacer preguntas se invierte el orden del sujeto y el verbo',
      },
    ],
  },

  science: {
    subjectId: 'science', subjectName: 'Ciencias', subjectEmoji: '🔭',
    topic: 'El método científico',
    sourceText: 'El método científico es un proceso sistemático para investigar fenómenos y adquirir conocimiento verificado. Sus etapas son: observación, hipótesis, experimentación, análisis de resultados y conclusión. Una hipótesis científica válida debe ser falseable, es decir, debe ser posible diseñar un experimento que pueda demostrar que es incorrecta. Si los resultados experimentales la apoyan reiteradamente, la hipótesis puede elevarse al rango de teoría científica.',
    questions: [
      {
        id: 'sci_q1', sourcePage: 1,
        text: '¿Cuál es la primera etapa del método científico?',
        options: [
          { id: 'A', text: 'Formular una hipótesis' },
          { id: 'B', text: 'Observar un fenómeno' },
          { id: 'C', text: 'Publicar los resultados' },
        ],
        correctOptionId: 'B',
        explanation: 'La observación es el punto de partida: el científico registra un fenómeno que le genera preguntas. A partir de ella formula la hipótesis que luego experimenta.',
        sourceQuote: 'Sus etapas son: observación, hipótesis, experimentación, análisis de resultados y conclusión.',
      },
      {
        id: 'sci_q2', sourcePage: 1,
        text: '¿Qué propiedad debe tener una hipótesis científica para ser válida?',
        options: [
          { id: 'A', text: 'Debe ser aceptada por todos los científicos del mundo' },
          { id: 'B', text: 'Debe ser imposible de comprobar experimentalmente' },
          { id: 'C', text: 'Debe ser falseable, es decir, posible de refutar' },
          { id: 'D', text: 'Debe estar escrita en una revista indexada' },
        ],
        correctOptionId: 'C',
        explanation: 'Falseable significa que puede ponerse a prueba. Si no hay forma de demostrar que una hipótesis es falsa, no es científica — puede ser filosófica o especulativa, pero no ciencia.',
        sourceQuote: 'Una hipótesis científica válida debe ser falseable, es decir, debe ser posible diseñar un experimento que pueda demostrar que es incorrecta.',
      },
      {
        id: 'sci_q3', sourcePage: 2,
        text: 'Un científico prueba su hipótesis 10 veces con el mismo resultado positivo. ¿A qué rango puede ascender su hipótesis?',
        options: [
          { id: 'A', text: 'Ley matemática' },
          { id: 'B', text: 'Axioma filosófico' },
          { id: 'C', text: 'Teoría científica' },
          { id: 'D', text: 'Postulado religioso' },
        ],
        correctOptionId: 'C',
        explanation: 'Cuando una hipótesis es confirmada repetidamente por la experimentación, puede convertirse en una teoría científica. Las teorías son explicaciones robustas y ampliamente verificadas.',
        sourceQuote: 'Si los resultados experimentales la apoyan reiteradamente, la hipótesis puede elevarse al rango de teoría científica.',
      },
    ],
  },

  physics: {
    subjectId: 'physics', subjectName: 'Física', subjectEmoji: '⚡',
    topic: 'Las tres leyes del movimiento de Newton',
    sourceText: 'Isaac Newton formuló tres leyes que rigen el movimiento de los cuerpos. La primera ley (inercia) establece que un cuerpo en reposo permanece en reposo y un cuerpo en movimiento sigue en línea recta a velocidad constante, a menos que actúe una fuerza neta sobre él. La segunda ley establece que la fuerza neta es igual a la masa por la aceleración (F = m·a). La tercera ley establece que por cada acción existe una reacción igual y en sentido contrario.',
    questions: [
      {
        id: 'phy_q1', sourcePage: 1,
        text: '¿Qué establece la primera ley de Newton (inercia)?',
        options: [
          { id: 'A', text: 'La fuerza es igual a masa por aceleración' },
          { id: 'B', text: 'Un cuerpo en reposo permanece en reposo salvo que actúe una fuerza' },
          { id: 'C', text: 'Toda acción tiene una reacción igual y contraria' },
        ],
        correctOptionId: 'B',
        explanation: 'La inercia es la tendencia de los cuerpos a mantener su estado de movimiento (o reposo). Solo una fuerza externa puede cambiar ese estado.',
        sourceQuote: 'un cuerpo en reposo permanece en reposo y un cuerpo en movimiento sigue en línea recta a velocidad constante, a menos que actúe una fuerza neta',
      },
      {
        id: 'phy_q2', sourcePage: 1,
        text: 'Aplicas la misma fuerza a dos objetos: uno tiene el doble de masa que el otro. ¿Qué ocurre con la aceleración del más pesado?',
        options: [
          { id: 'A', text: 'Se duplica' },
          { id: 'B', text: 'Se mantiene igual' },
          { id: 'C', text: 'Se reduce a la mitad' },
          { id: 'D', text: 'Se hace cero' },
        ],
        correctOptionId: 'C',
        explanation: 'Según F = m·a, si F es constante y m se duplica, entonces a = F/m se reduce a la mitad. A mayor masa, menor aceleración con la misma fuerza.',
        sourceQuote: 'la fuerza neta es igual a la masa por la aceleración (F = m·a)',
      },
      {
        id: 'phy_q3', sourcePage: 2,
        text: 'Un cohete expulsa gases hacia atrás a alta velocidad y avanza hacia adelante. ¿Cuál ley de Newton explica esto?',
        options: [
          { id: 'A', text: 'Primera ley (inercia)' },
          { id: 'B', text: 'Segunda ley (F = m·a)' },
          { id: 'C', text: 'Tercera ley (acción y reacción)' },
          { id: 'D', text: 'Ley de gravitación universal' },
        ],
        correctOptionId: 'C',
        explanation: 'Los gases expulsados hacia atrás (acción) generan una fuerza igual y opuesta que impulsa el cohete hacia adelante (reacción). Esta es la tercera ley de Newton.',
        sourceQuote: 'por cada acción existe una reacción igual y en sentido contrario',
      },
    ],
  },

  general: {
    subjectId: 'general', subjectName: 'Comprensión Lectora', subjectEmoji: '📖',
    topic: 'El texto informativo y sus características',
    sourceText: 'Un texto informativo tiene como objetivo comunicar datos, hechos o conocimientos de manera objetiva y verificable. Se caracteriza por el uso de lenguaje preciso y vocabulario específico del tema. Los tipos más comunes son noticias, artículos de enciclopedia e informes científicos. A diferencia de los textos literarios —que buscan generar emociones o entretener—, los textos informativos priorizan la exactitud y la comprobación de la información que presentan.',
    questions: [
      {
        id: 'gen_q1', sourcePage: 1,
        text: '¿Cuál es el objetivo principal de un texto informativo?',
        options: [
          { id: 'A', text: 'Generar emociones en el lector' },
          { id: 'B', text: 'Entretener con historias imaginativas' },
          { id: 'C', text: 'Comunicar datos y hechos de manera objetiva' },
        ],
        correctOptionId: 'C',
        explanation: 'El texto informativo busca transmitir conocimiento verificable, no emocionar ni entretener. Su lenguaje es preciso y objetivo.',
        sourceQuote: 'Un texto informativo tiene como objetivo comunicar datos, hechos o conocimientos de manera objetiva y verificable.',
      },
      {
        id: 'gen_q2', sourcePage: 1,
        text: '¿Cuál de estos textos es un ejemplo de texto informativo?',
        options: [
          { id: 'A', text: 'Un poema de amor de Pablo Neruda' },
          { id: 'B', text: 'Una novela de ciencia ficción' },
          { id: 'C', text: 'Un artículo de enciclopedia' },
          { id: 'D', text: 'Un cuento de misterio' },
        ],
        correctOptionId: 'C',
        explanation: 'El artículo de enciclopedia presenta información factual y verificable sobre un tema. Los poemas, novelas y cuentos son textos literarios con otros propósitos.',
        sourceQuote: 'Los tipos más comunes son noticias, artículos de enciclopedia e informes científicos.',
      },
      {
        id: 'gen_q3', sourcePage: 1,
        text: '¿En qué se diferencia principalmente un texto informativo de uno literario?',
        options: [
          { id: 'A', text: 'El informativo siempre es más corto que el literario' },
          { id: 'B', text: 'El informativo prioriza la exactitud; el literario busca emocionar' },
          { id: 'C', text: 'El literario usa más palabras técnicas que el informativo' },
          { id: 'D', text: 'El informativo no tiene estructura definida' },
        ],
        correctOptionId: 'B',
        explanation: 'La diferencia fundamental es el propósito: el texto informativo busca informar con exactitud y objetividad, mientras el literario apunta a generar una experiencia estética o emocional.',
        sourceQuote: 'los textos informativos priorizan la exactitud y la comprobación de la información',
      },
    ],
  },

};

export function getDemoSession(subjectId: string): DemoSession {
  return SESSIONS[subjectId] ?? SESSIONS.general;
}
