-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: gateway01.sa-east-1.prod.aws.tidbcloud.com    Database: silos_event_db
-- ------------------------------------------------------
-- Server version	8.0.11-TiDB-v7.5.6-serverless

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `clientes`
--

DROP TABLE IF EXISTS `clientes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_tutor` varchar(100) NOT NULL,
  `telefono_whatsapp` varchar(20) NOT NULL,
  `nombre_cumpleanero` varchar(100) NOT NULL,
  `fecha_nacimiento` date NOT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `creado_el` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clientes`
--

LOCK TABLES `clientes` WRITE;
/*!40000 ALTER TABLE `clientes` DISABLE KEYS */;
/*!40000 ALTER TABLE `clientes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `configuracion_sistema`
--

DROP TABLE IF EXISTS `configuracion_sistema`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracion_sistema` (
  `id` int NOT NULL DEFAULT '1',
  `dias_anticipacion` int NOT NULL DEFAULT '60',
  `telefono_admin` varchar(20) NOT NULL,
  `cantidad_notificaciones` int NOT NULL,
  `plazos_dias` int NOT NULL,
  `tema` varchar(10) NOT NULL DEFAULT 'light',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `configuracion_sistema`
--

LOCK TABLES `configuracion_sistema` WRITE;
/*!40000 ALTER TABLE `configuracion_sistema` DISABLE KEYS */;
/*!40000 ALTER TABLE `configuracion_sistema` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `historial_notificaciones`
--

DROP TABLE IF EXISTS `historial_notificaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `historial_notificaciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente_id` int NOT NULL,
  `fecha_envio` timestamp DEFAULT CURRENT_TIMESTAMP,
  `anio_festejo` int NOT NULL,
  `numero_notificacion` smallint unsigned NOT NULL,
  `fecha_programada` date NOT NULL,
  `plantilla_id` int DEFAULT NULL,
  `mensaje_enviado` text DEFAULT NULL,
  `estado` varchar(30) NOT NULL,
  `detalle_error` text DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `historial_notificaciones_cliente_id_anio_festejo_index` (`cliente_id`,`anio_festejo`),
  KEY `historial_notificaciones_plantilla_id_index` (`plantilla_id`),
  UNIQUE KEY `historial_notificaciones_cliente_anio_aviso_unique` (`cliente_id`,`anio_festejo`,`numero_notificacion`),
  CONSTRAINT `historial_notificaciones_cliente_id_foreign` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `historial_notificaciones`
--

LOCK TABLES `historial_notificaciones` WRITE;
/*!40000 ALTER TABLE `historial_notificaciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `historial_notificaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plantillas_mensajes`
--

DROP TABLE IF EXISTS `plantillas_mensajes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plantillas_mensajes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_oferta` varchar(100) NOT NULL,
  `cuerpo_mensaje` text NOT NULL,
  `numero_aviso` smallint unsigned NOT NULL DEFAULT '1',
  `activa` tinyint(1) DEFAULT '1',
  `creado_el` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plantillas_mensajes`
--

LOCK TABLES `plantillas_mensajes` WRITE;
/*!40000 ALTER TABLE `plantillas_mensajes` DISABLE KEYS */;
/*!40000 ALTER TABLE `plantillas_mensajes` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-27 20:37:53
