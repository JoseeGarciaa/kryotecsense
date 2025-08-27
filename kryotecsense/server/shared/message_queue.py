import asyncio
import json
import os
from typing import Optional, Dict, Any, Callable
import aio_pika
from aio_pika import Message, DeliveryMode
import logging

logger = logging.getLogger(__name__)

class MessageQueue:
    def __init__(self):
        self.connection: Optional[aio_pika.RobustConnection] = None
        self.channel: Optional[aio_pika.Channel] = None
        self.rabbitmq_url = self._get_rabbitmq_url()
        
    def _get_rabbitmq_url(self) -> str:
        """Construir URL de RabbitMQ desde variables de entorno"""
        host = os.getenv('RABBITMQ_HOST', 'localhost')
        port = os.getenv('RABBITMQ_PORT', '5672')
        user = os.getenv('RABBITMQ_USER', 'kryotec')
        password = os.getenv('RABBITMQ_PASS', 'kryotec2024')
        
        return f"amqp://{user}:{password}@{host}:{port}/"
    
    async def connect(self, max_retries: int = 3, retry_delay: float = 2.0):
        """Establecer conexión con RabbitMQ con reintentos"""
        for attempt in range(max_retries):
            try:
                self.connection = await aio_pika.connect_robust(
                    self.rabbitmq_url,
                    loop=asyncio.get_event_loop()
                )
                self.channel = await self.connection.channel()
                await self.channel.set_qos(prefetch_count=10)
                logger.info("✅ Conectado a RabbitMQ exitosamente")
                return
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"⚠️ Intento {attempt + 1}/{max_retries} fallido: {e}. Reintentando en {retry_delay}s...")
                    await asyncio.sleep(retry_delay)
                else:
                    logger.error(f"❌ Error conectando a RabbitMQ después de {max_retries} intentos: {e}")
                    raise
    
    async def disconnect(self):
        """Cerrar conexión con RabbitMQ"""
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
            logger.info("🔌 Desconectado de RabbitMQ")
    
    async def declare_queue(self, queue_name: str, durable: bool = True) -> aio_pika.Queue:
        """Declarar una cola"""
        if not self.channel:
            await self.connect()
        
        queue = await self.channel.declare_queue(
            queue_name,
            durable=durable
        )
        return queue
    
    async def publish_message(self, queue_name: str, message: Dict[Any, Any]):
        """Publicar un mensaje en una cola"""
        try:
            if not self.channel:
                await self.connect()
            
            # Declarar la cola por si no existe
            await self.declare_queue(queue_name)
            
            # Convertir mensaje a JSON
            message_body = json.dumps(message, default=str)
            
            # Publicar mensaje
            await self.channel.default_exchange.publish(
                Message(
                    message_body.encode(),
                    delivery_mode=DeliveryMode.PERSISTENT
                ),
                routing_key=queue_name
            )
            
            logger.info(f"📤 Mensaje publicado en cola '{queue_name}': {message}")
            
        except Exception as e:
            logger.error(f"❌ Error publicando mensaje: {e}")
            raise
    
    async def consume_messages(self, queue_name: str, callback: Callable):
        """Consumir mensajes de una cola"""
        try:
            if not self.channel:
                await self.connect()
            
            queue = await self.declare_queue(queue_name)
            
            async def process_message(message: aio_pika.IncomingMessage):
                async with message.process():
                    try:
                        # Decodificar mensaje JSON
                        message_data = json.loads(message.body.decode())
                        logger.info(f"📥 Mensaje recibido de cola '{queue_name}': {message_data}")
                        
                        # Ejecutar callback
                        await callback(message_data)
                        
                    except Exception as e:
                        logger.error(f"❌ Error procesando mensaje: {e}")
                        raise
            
            # Consumir mensajes
            await queue.consume(process_message)
            logger.info(f"👂 Escuchando mensajes en cola '{queue_name}'")
            
        except Exception as e:
            logger.error(f"❌ Error consumiendo mensajes: {e}")
            raise

# Instancia global del message queue
message_queue = MessageQueue()

# Funciones de conveniencia
async def publish_timer_completed(timer_data: Dict[Any, Any]):
    """Publicar evento de timer completado"""
    await message_queue.publish_message("timer_completed", {
        "event_type": "timer_completed",
        "timestamp": timer_data.get("timestamp"),
        "timer": timer_data
    })

async def publish_alert_created(alert_data: Dict[Any, Any]):
    """Publicar evento de alerta creada"""
    await message_queue.publish_message("alert_created", {
        "event_type": "alert_created",
        "timestamp": alert_data.get("timestamp"),
        "alert": alert_data
    })

async def publish_inventory_updated(inventory_data: Dict[Any, Any]):
    """Publicar evento de inventario actualizado"""
    await message_queue.publish_message("inventory_updated", {
        "event_type": "inventory_updated", 
        "timestamp": inventory_data.get("timestamp"),
        "inventory": inventory_data
    })
