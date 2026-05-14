"""Database client for direct PostgreSQL access (read-only)."""

import asyncpg
import structlog
from typing import Optional
from .config import Settings

logger = structlog.get_logger()


class DatabaseClient:
    """
    Read-only database client for the AI Engine.
    
    Best Practice Notes:
    - This client performs READ-ONLY operations
    - Only accesses tables needed for AI personalization
    - Uses connection pooling for efficiency
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._pool: Optional[asyncpg.Pool] = None

    async def connect(self) -> None:
        """Initialize the connection pool."""
        if self._pool is not None:
            return
            
        try:
            self._pool = await asyncpg.create_pool(
                self.settings.database_url,
                min_size=2,
                max_size=10,
                command_timeout=5,
            )
            logger.info("Database connection pool created")
        except Exception as e:
            logger.error("Failed to create database pool", error=str(e))
            raise

    async def close(self) -> None:
        """Close the connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
            logger.info("Database connection pool closed")

    async def get_user_context(self, user_id: str) -> Optional[dict]:
        """
        Fetch active user context directly from the database.
        
        Args:
            user_id: The user's ID
            
        Returns:
            User context dict or None if no context configured
        """
        if not self._pool:
            await self.connect()
            
        try:
            async with self._pool.acquire() as conn:
                # Query the active context version for this user
                row = await conn.fetchrow(
                    """
                    SELECT 
                        ucv.content_category,
                        ucv.content_category_other,
                        ucv.tone_presets,
                        ucv.channel_description,
                        ucv.target_audience,
                        ucv.avoid_topics

                    FROM user_context_versions ucv
                    JOIN user_settings us ON ucv.settings_id = us.id
                    WHERE us.user_id = $1 AND ucv.is_active = true
                    ORDER BY ucv.version DESC
                    LIMIT 1
                    """,
                    user_id
                )
                
                if not row:
                    logger.debug("No active context found", user_id=user_id)
                    return None
                
                logger.debug(
                    "Fetched user context from DB",
                    user_id=user_id,
                    has_tones=bool(row["tone_presets"])
                )
                
                return {
                    "content_category": row["content_category"],
                    "content_category_other": row["content_category_other"],
                    "tone_presets": row["tone_presets"] or [],
                    "channel_description": row["channel_description"],
                    "target_audience": row["target_audience"],
                    "avoid_topics": row["avoid_topics"] or [],

                }
                
        except Exception as e:
            logger.error(
                "Error fetching user context from DB",
                user_id=user_id,
                error=str(e)
            )
            return None

    async def get_user_affiliate_keywords(self, user_id: str) -> list[str]:
        """
        Fetch user's affiliate keywords from the database.
        
        Args:
            user_id: The user's ID
            
        Returns:
            List of keyword strings
        """
        if not self._pool:
            await self.connect()
            
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT keywords
                    FROM affiliate_links
                    WHERE user_id = $1 AND is_active = true
                    """,
                    user_id
                )
                
                # Flatten keywords from all active affiliate links
                keywords = []
                for row in rows:
                    if row["keywords"]:
                        keywords.extend(row["keywords"])
                
                return keywords
                
        except Exception as e:
            logger.error(
                "Error fetching affiliate keywords from DB",
                user_id=user_id,
                error=str(e)
            )
            return []
