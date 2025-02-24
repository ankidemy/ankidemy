# Especificación de Requisitos de Software
## Para Ankidemy
Versión 1.0  
Preparado por Ankidemy Team  
Ankidemy  
Febrero 11, 2025  

## Historial de Revisiones
| Nombre         | Fecha          | Razón del Cambio           | Versión |
|---------------|---------------|-----------------------------|----------|
| Ankidemy Team | 11/02/2025    | Versión inicial del documento | 0.1      |


## 1. Introducción

### 1.1 Propósito
Ankidemy es un sistema de aprendizaje basado en repetición espaciada, diseñado específicamente para estructuras de conocimiento jerárquicas. Este documento especifica los requisitos funcionales y no funcionales del sistema.

### 1.2 Alcance del Producto
Ankidemy es un marco de trabajo de código abierto que permite a individuos y organizaciones:
- Crear y gestionar rutas de aprendizaje personalizadas
- Implementar la repetición espaciada en estructuras jerárquicas de conocimiento
- Realizar seguimiento del progreso de aprendizaje
- Compartir y exportar rutas de aprendizaje completas

### 1.3 Audiencia Prevista
Este documento está dirigido a:
- Desarrolladores que implementarán el sistema
- Administradores de sistema que desplegarán la plataforma
- Educadores que crearán contenido
- Colaboradores potenciales del proyecto de código abierto

## 2. Descripción General

### 2.1 Perspectiva del Producto
Ankidemy es un sistema independiente que puede ser desplegado como servidor para múltiples usuarios. Se diferencia de otros sistemas de repetición espaciada por su enfoque en estructuras jerárquicas de conocimiento y su capacidad para optimizar el proceso de aprendizaje basado en las dependencias entre temas.

### 2.2 Funciones Principales
- Gestión de estructuras jerárquicas de conocimiento
- Sistema de repetición espaciada adaptativo
- Creación y gestión de ejercicios con variables
- Evaluación automática de respuestas
- Seguimiento del progreso y análisis de aprendizaje
- Capacidad de compartir rutas de aprendizaje

### 2.3 Características de Usuario
- Estudiantes: usuarios principales que siguen rutas de aprendizaje
- Creadores de contenido: educadores o expertos que desarrollan rutas de aprendizaje
- Administradores: gestionan el sistema y los usuarios

### 2.4 Entorno Operativo
- Aplicación web accesible mediante navegadores modernos
- Servidor capaz de manejar múltiples usuarios concurrentes
- Base de datos para almacenar rutas de aprendizaje y progreso

### 2.5 Restricciones de Diseño
- Sistema modular para permitir diferentes tipos de ejercicios
- Interfaz de usuario intuitiva y responsiva
- Arquitectura escalable para múltiples usuarios

## 3. Requisitos de Interfaz

### 3.1 Interfaz de Usuario
- Panel de gestión de rutas de aprendizaje
- Editor de ejercicios con soporte para múltiples formatos
- Visualizador de grafos para estructuras jerárquicas
- Panel de progreso y estadísticas
- Sistema de navegación intuitivo

### 3.2 Interfaces de Software
- API RESTful para integración con otros sistemas
- Sistema de autenticación
- Base de datos relacional
- Sistema de caché para optimizar rendimiento

## 4. Características del Sistema

### 4.1 Gestión de Conocimiento
- Creación y edición de nodos de conocimiento
- Definición de prerequisitos y dependencias
- Importación masiva de ejercicios
- Gestión de recursos y materiales de estudio

### 4.2 Sistema de Ejercicios
- Soporte para múltiples tipos de ejercicios
- Variables dinámicas en ejercicios
- Verificación automática de respuestas
- Sistema de retroalimentación inmediata

### 4.3 Optimización de Aprendizaje
- Algoritmo de priorización de repasos
- Análisis de patrones de olvido
- Adaptación a la velocidad de aprendizaje individual
- Identificación de puntos débiles en el conocimiento

## 5. Requisitos No Funcionales

### 5.1 Rendimiento
- Tiempo de respuesta máximo de 2 segundos
- Soporte para al menos 100 usuarios concurrentes
- Capacidad de manejar grandes conjuntos de ejercicios

### 5.2 Seguridad
- Autenticación segura de usuarios
- Protección de datos personales
- Control de acceso basado en roles
- Backups regulares de datos

### 5.3 Usabilidad
- Interfaz intuitiva y fácil de aprender
- Documentación clara y completa
- Soporte para múltiples idiomas
- Accesibilidad web

### 5.4 Mantenibilidad
- Código modular y bien documentado
- Pruebas automatizadas
- Sistema de control de versiones
- Documentación técnica actualizada

## Apéndices

### Apéndice A: Glosario
- Repetición Espaciada: técnica de aprendizaje que utiliza intervalos crecientes entre repasos
- Estructura Jerárquica: organización de conocimiento en niveles de dependencia
- Nodo: unidad básica de conocimiento en el sistema
- Ruta de Aprendizaje: secuencia planificada de temas y ejercicios

### Apéndice B: Elementos por Determinar
1. Formato específico para importación masiva de ejercicios
2. Métricas exactas para el algoritmo de optimización
3. Estándares de integración con sistemas externos
