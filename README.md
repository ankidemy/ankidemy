# Ankidemy

![Ankidemy en funcionamiento](https://raw.githubusercontent.com/wiki/ankidemy/ankidemy/Diagramas/ankidemy-preview.png)

Ankidemy es un marco de trabajo de código abierto que implementa un sistema de aprendizaje basado en repetición espaciada, específicamente diseñado para estructuras de conocimiento jerárquicas. El proyecto optimiza el proceso de aprendizaje en áreas donde la memorización tradicional no es suficiente, como las matemáticas, la programación y otras disciplinas que requieren un entendimiento profundo y progresivo.

## 🎯 Objetivo

Proporcionar una herramienta que permita a individuos y organizaciones:
- Crear rutas de aprendizaje personalizadas y estructuradas
- Optimizar el proceso de repaso mediante repetición espaciada inteligente
- Verificar el progreso a través de ejercicios dinámicos
- Compartir y reutilizar rutas de aprendizaje completas

## 🌟 Características Principales

### ✅ Características Implementadas

#### Sistema de Autenticación Completo
- Registro de usuarios con validación
- Inicio de sesión (email o username)
- Refresh tokens para sesiones persistentes
- Autenticación JWT robusta

#### Gestión de Dominios
- Creación y edición de dominios de conocimiento
- Dominios públicos y privados
- Sistema de inscripción y comentarios
- Importación/exportación de dominios completos

#### Estructura Jerárquica del Conocimiento
- Organización de definiciones y ejercicios en grafos
- Gestión avanzada de dependencias y prerrequisitos
- Visualización interactiva de la ruta de aprendizaje
- Editor visual de posiciones de nodos

#### Sistema SRS (Spaced Repetition System) Avanzado
- Algoritmo adaptativo con propagación de créditos
- Estados de progreso: fresh → tackling → grasped → learned
- Priorización inteligente de repasos
- Reseñas explícitas e implícitas
- Análisis y estadísticas detalladas

#### Ejercicios y Definiciones
- Soporte para múltiples formatos
- Variables dinámicas para ejercicios
- Verificación automática de respuestas
- Sistema de dificultad y pistas

### Arquitectura del Sistema

**Frontend (Next.js + React + TypeScript)**
- Interfaz de usuario reactiva y moderna
- Componentes reutilizables con Tailwind CSS
- Integración con MathJax para contenido matemático
- Visualización de grafos con D3.js

**Backend (Go + Gin Framework)**
- API RESTful robusta y documentada
- Middleware de autenticación JWT
- Sistema de DAOs para acceso a datos
- Algoritmos SRS optimizados

**Base de Datos (PostgreSQL)**
- Esquema normalizado con integridad referencial
- Soporte para progreso de usuarios
- Historial completo de reseñas
- Sistema de prerrequisitos ponderados

## 🚀 Instalación y Deployment

### Prerrequisitos

- Docker y Docker Compose instalados
- Git para clonar el repositorio

### Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/your-username/ankidemy.git
   cd ankidemy
   ```

2. **Desplegar en modo desarrollo**
   ```bash
   # Opción 1: Usando make
   make dev
   
   # Opción 2: Usando docker-compose directamente
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up
   ```

3. **Acceder a la aplicación**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080
   - PgAdmin (opcional): http://localhost:5050

La aplicación se construirá y desplegará automáticamente. El primer deploy puede tomar algunos minutos mientras se descargan las dependencias.

### ⚠️ Nota sobre Producción

Actualmente, el deployment de producción (`docker-compose.prod.yml`) presenta algunos errores de tipado TypeScript que estamos trabajando por solucionar. Por ahora, **recomendamos usar únicamente el modo de desarrollo** para testing y evaluación.

## 💡 Modo de Uso

### Flujo de Trabajo del Usuario

1. **Registro e Inicio de Sesión**
   - Crear una cuenta nueva o acceder con credenciales existentes
   - El sistema mantiene la sesión con tokens JWT

2. **Explorar o Crear Dominios**
   - Navegar por dominios públicos disponibles
   - Crear tus propios dominios de conocimiento
   - Inscribirse en dominios de interés

3. **Estructurar el Conocimiento**
   - Agregar definiciones y conceptos al dominio
   - Crear ejercicios relacionados
   - Establecer relaciones de prerrequisitos entre nodos
   - Organizar visualmente el grafo de conocimiento

4. **Proceso de Aprendizaje**
   - Estudiar los temas teóricos (definiciones)
   - Practicar con ejercicios interactivos
   - Recibir retroalimentación inmediata
   - Seguir la ruta de repaso optimizada por el sistema SRS

5. **Seguimiento y Optimización**
   - Visualizar el progreso en tiempo real
   - Revisar estadísticas de aprendizaje
   - Identificar áreas que necesitan refuerzo
   - Ajustar la ruta según necesidades personales

### Características del Sistema SRS

- **Estados de Nodos**: Los conceptos progresan desde "fresh" (nuevo) hasta "learned" (aprendido)
- **Propagación de Créditos**: Los éxitos y fracasos afectan a nodos relacionados
- **Optimización de Repasos**: El sistema programa reseñas en momentos óptimos
- **Análisis Avanzado**: Estadísticas detalladas del progreso de aprendizaje

## 🛠️ Desarrollo

### Estructura del Proyecto

```
ankidemy/
├── client/          # Frontend Next.js
├── server/          # Backend Go
├── db/             # Scripts de base de datos
├── docker-compose*.yml
└── Makefile
```

### Comandos Útiles

```bash
# Desarrollo
make dev              # Iniciar en modo desarrollo
make test             # Ejecutar tests
make logs             # Ver logs de contenedores

# Docker Compose
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
docker-compose -f docker-compose.yml -f docker-compose.test.yml up  # Tests
```

### Documentation

Accede a la [Wiki del repositorio](https://github.com/ankidemy/ankidemy/wiki) para más información.

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Para contribuir:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add: AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

### Guías de Desarrollo

- Seguir las convenciones de código establecidas
- Escribir tests para nuevas funcionalidades
- Actualizar documentación cuando sea necesario
- Usar commits descriptivos y claros

## 📜 Licencia

Este proyecto está bajo la licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## ✨ Inspiración

Este proyecto está inspirado en:
- La técnica de repetición espaciada de Hermann Ebbinghaus
- Los sistemas de tarjetas de memorización como Anki
- El trabajo de Justin Skycak sobre repetición espaciada en estructuras jerárquicas
- La necesidad de sistemas eficientes para el aprendizaje de temas complejos

## 🔗 Enlaces Útiles

- [Documentación de la API](API.md)
- [Guía Rápida de API](API-Cheatsheet.md)
- [Blog Post de Justin Skycak](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/)

## 📞 Contacto

✉️ [ankidemy@gmail.com](mailto:ankidemy@gmail.com)

---

**Estado del Proyecto**: En desarrollo activo. Las funcionalidades y la documentación se actualizan regularmente.
