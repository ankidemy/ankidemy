# Ankidemy

Ankidemy es un marco de trabajo de código abierto que implementa un sistema de aprendizaje basado en repetición espaciada, específicamente diseñado para estructuras de conocimiento jerárquicas. El proyecto busca optimizar el proceso de aprendizaje en áreas donde la memorización tradicional no es suficiente, como las matemáticas, la programación y otras disciplinas que requieren un entendimiento profundo y progresivo.

## 🎯 Objetivo

Proporcionar una herramienta que permita a individuos y organizaciones:
- Crear rutas de aprendizaje personalizadas y estructuradas
- Optimizar el proceso de repaso mediante repetición espaciada inteligente
- Verificar el progreso a través de ejercicios dinámicos
- Compartir y reutilizar rutas de aprendizaje completas

## 🌟 Características Principales

### Estructura Jerárquica del Conocimiento
- Organización de temas y subtemas en forma de grafo
- Gestión de dependencias y prerrequisitos para cada tema
- Visualización clara de la ruta de aprendizaje

### Sistema de Repetición Espaciada Optimizado
- Algoritmo adaptativo que considera las relaciones jerárquicas
- Priorización inteligente de repasos
- Adaptación a la velocidad de aprendizaje individual

### Ejercicios Dinámicos
- Soporte para múltiples formatos de ejercicios
- Variables dinámicas para generar nuevos ejercicios
- Verificación automática de respuestas
- Importación masiva de ejercicios

### Gestión de Recursos
- Vinculación de materiales de estudio
- Referencias a fuentes externas
- Organización de recursos por tema

## 🚀 Comenzando

### Prerrequisitos
- Docker (versión 20.10 o superior)
- Docker Compose (versión 2.0 o superior)
- Make (opcional, pero recomendado)
- Puertos disponibles: 4500, 8765, 54320, 5051

### Configuración de Puertos

La aplicación utiliza los siguientes puertos para evitar conflictos con otras aplicaciones:

| Servicio | Puerto Externo | Puerto Interno | Descripción |
|----------|---------------|----------------|-------------|
| Cliente (Next.js) | 4500 | 3000 | Interfaz web de usuario |
| Servidor (Go API) | 8765 | 8765 | API REST del backend |
| Base de Datos (PostgreSQL) | 54320 | 5432 | Base de datos PostgreSQL |
| PgAdmin | 5051 | 5050 | Interfaz de administración de BD |

**Nota**: Los puertos externos son los que usas desde tu máquina host. Los puertos internos son los que usa Docker internamente en la red de contenedores.

### Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/ankidemy.git
   cd ankidemy
   ```

2. **Configurar variables de entorno**

   El archivo `.env` ya está configurado con valores por defecto. Si necesitas personalizarlos:
   ```bash
   # Edita el archivo .env según tus necesidades
   nano .env
   ```

3. **Iniciar el entorno de desarrollo**
   ```bash
   # Usando Make (recomendado)
   make dev

   # O usando Docker Compose directamente
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
   ```

4. **Acceder a la aplicación**
   - **Aplicación web**: http://localhost:4500
   - **API**: http://localhost:8765
   - **PgAdmin**: http://localhost:5051
     - Email: admin@example.com
     - Contraseña: admin

5. **Detener el entorno**
   ```bash
   # Usando Make
   make down

   # O usando Docker Compose
   docker-compose down
   ```

### Comandos Útiles

```bash
# Iniciar en modo desarrollo
make dev

# Iniciar en modo producción
make up

# Detener todos los servicios
make down

# Ver logs en tiempo real
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f db
```

## 💡 Cómo Funciona

1. **Planificación del Aprendizaje**
   - Define tu área de estudio
   - Organiza los temas en una estructura jerárquica
   - Agrega recursos y materiales de estudio

2. **Creación de Ejercicios**
   - Añade ejercicios para cada tema
   - Establece criterios de evaluación y variables en los ejercicios

3. **Proceso de Aprendizaje**
   - Estudia los temas teóricos
   - Practica con ejercicios
   - Recibe retroalimentación inmediata
   - Sigue la ruta de repaso optimizada

4. **Seguimiento y Optimización**
   - Visualiza tu progreso
   - Identifica áreas de mejora
   - Ajusta tu ruta según necesidades

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Si deseas contribuir:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add: AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📜 Licencia

Este proyecto está bajo la licencia MIT - ver el archivo [License](LICENSE) para más detalles.

## ✨ Inspiración

Este proyecto está inspirado en:
- La técnica de repetición espaciada
- Los sistemas de tarjetas de memorización
- El trabajo de Justin Skycak sobre repetición espaciada en estructuras jerárquicas
- La necesidad de un sistema eficiente para el aprendizaje de temas complejos

## 🔗 Enlaces Útiles

- [Documentación](TBD)
- [Guía de Contribución](TBD)
- [Ejemplos de Uso](TBD)
- [Blog Post de Justin Skycak](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/)

## 📞 Contacto

✉️ [Email](mailto:ankidemy@gmail.com)

---


**Nota**: Este proyecto está en desarrollo activo. Las funcionalidades y la documentación se actualizarán regularmente.
