# NemUp - Educational Learning Platform

Una aplicación móvil educativa tipo Duolingo, enfocada en ayudar a estudiantes de enseñanza media a mejorar sus notas mediante la carga de documentos y la generación automática de sesiones de estudio con IA.

## 🚀 Características Implementadas

### Onboarding (7 pantallas)

1. **Welcome** 🎉
   - Pantalla de bienvenida con presentación de la app
   - Características principales destacadas
   - CTA para comenzar

2. **Name & Curso** 👤
   - Ingreso de nombre del usuario
   - Selección del nivel (7º Básico - 4º Medio)
   - Validación de campos

3. **Goal** 🎯
   - Establecimiento de meta de nota
   - Slider interactivo (4.0 - 7.0)
   - Presets rápidos
   - Motivador personalizado

4. **Subjects** 📚
   - Selección múltiple de asignaturas
   - Opciones: Matemáticas, Lengua, Inglés, Ciencias, Historia, Biología, Química, Física
   - Contador de selecciones

5. **Goal Type** 💡
   - Razón principal para estudiar
   - Opciones: Preparar exámenes, Mejorar notas, Recuperarme, Mantener nivel
   - Radio button seleccionable

6. **Daily Commitment** ⏱️
   - Tiempo diario de estudio comprometido
   - Opciones: 5 min, 15 min, 30 min, 1 hora, 2+ horas
   - Tag "RECOMENDADO" para opciones óptimas
   - Tips motivacionales

7. **Complete** ✨
   - Resumen del perfil creado
   - Confirmación de todos los datos
   - CTA para comenzar a estudiar
   - Confetti celebration effect

## 🛠️ Stack Tecnológico

- **Framework**: React Native con Expo
- **Navegación**: Expo Router
- **Estado Global**: React Context API
- **Lenguaje**: TypeScript
- **Styling**: React Native StyleSheet

## 📦 Dependencias Principales

```json
{
  "expo": "~54.0.33",
  "expo-router": "~6.0.23",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "react-native-gesture-handler": "~2.28.0",
  "react-native-reanimated": "~4.1.1"
}
```

## 🎨 Diseño

### Paleta de Colores

- **Brand**: #5B3DF5 (Morado principal)
- **Accent**: #FF5B9F (Rosa)
- **Lime**: #C4F852 (Verde lima)
- **Teal**: #00C2A8 (Verde azulado)
- **Ink**: #0B0B1A (Negro profundo)

### Tipografía

- Font: Geist (Google Fonts)
- Pesos: 400, 500, 600, 700, 800, 900

## 🏗️ Estructura del Proyecto

```
NemUp/
├── app/
│   ├── onboarding/
│   │   ├── index.tsx           # Navegador principal del onboarding
│   │   ├── welcome.tsx          # Pantalla 1: Welcome
│   │   ├── name-curso.tsx       # Pantalla 2: Name & Curso
│   │   ├── goal.tsx             # Pantalla 3: Goal
│   │   ├── subjects.tsx         # Pantalla 4: Subjects
│   │   ├── goal-type.tsx        # Pantalla 5: Goal Type
│   │   ├── commitment.tsx       # Pantalla 6: Commitment
│   │   └── complete.tsx         # Pantalla 7: Complete
│   ├── (tabs)/                  # Main app layout (placeholder)
│   ├── _layout.tsx              # Root layout con OnboardingProvider
│   └── modal.tsx
├── contexts/
│   └── OnboardingContext.tsx    # Context de onboarding con estado
├── types/
│   └── onboarding.ts            # Tipos e interfaces
├── constants/
│   └── Colors.ts                # Paleta de colores
└── hooks/
    └── use-color-scheme.ts
```

## 🚀 Cómo Comenzar

### Instalación

1. **Accede al proyecto**
   ```bash
   cd C:\apps\NemUp
   ```

2. **Instala dependencias** (si es necesario)
   ```bash
   npm install
   ```

### Ejecutar en Desarrollo

```bash
# iOS (requiere macOS)
npm run ios

# Android
npm run android

# Web
npm run web

# O usa Expo Go (recomendado)
npm start
```

## 🔄 Flujo de Onboarding

1. Usuario ve Welcome screen
2. Ingresa nombre y selecciona nivel
3. Establece meta de notas
4. Selecciona asignaturas
5. Elige razón para estudiar
6. Selecciona tiempo diario de estudio
7. Revisa su perfil y comienza

El estado del onboarding se mantiene en OnboardingContext. Una vez completado, se redirige a la app principal.

## 📝 Estructura de Datos del Onboarding

```typescript
interface OnboardingData {
  name: string;                  // Nombre del usuario
  curso: string;                 // Nivel (7º Básico - 4º Medio)
  goal: number;                  // Meta de nota (0-7)
  subjects: string[];            // Array de IDs de asignaturas
  goalType: string;              // Razón para estudiar
  dailyCommitment: string;       // Tiempo diario comprometido
  completed: boolean;            // Flag de completación
}
```

## 🎯 Próximos Pasos

- [ ] Integrar persistencia con AsyncStorage
- [ ] Agregar pantalla principal de home
- [ ] Implementar carga de documentos
- [ ] Integrar IA para generar sesiones de estudio
- [ ] Crear dashboard de progreso
- [ ] Agregar sistema de gamificación
- [ ] Implementar push notifications

## 📱 Puntos de Diseño Clave

- ✅ Interfaz limpia y moderna (Duolingo-style)
- ✅ Animaciones suaves en transiciones
- ✅ Validación de campos en tiempo real
- ✅ Progreso visual con dots indicadores
- ✅ Botones de navegación intuitivos
- ✅ Emojis para mejor experiencia visual
- ✅ Responsive design para diferentes tamaños

## 🐛 Troubleshooting

### npm install falla
Si tienes errores de permisos con npm:
```bash
rmdir /s /q node_modules
npm install
```

### El app no inicia
1. Limpia caché: `npm start --clear`
2. Reinicia Metro bundler: `npm start`
3. Cierra y abre nuevamente el emulador/dispositivo

## 📄 Licencia

NemUp © 2026 - Educación para todos

---

**Estado del Proyecto**: ✅ Fase 1: Onboarding completada


- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
