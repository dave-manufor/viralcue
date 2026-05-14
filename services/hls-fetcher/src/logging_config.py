"""
HLS Fetcher - Logging configuration

Industry standard: Use Python's logging module with structured logging
for production applications running in Docker containers.
"""
import logging
import sys

# Configure root logger for the application
def setup_logging() -> None:
    """Configure logging for the HLS Fetcher service."""
    
    # Create formatter - structured format for easy parsing
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    # Console handler - writes to stdout for Docker
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.setLevel(logging.DEBUG)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(handler)
    
    # Set specific loggers
    logging.getLogger("src").setLevel(logging.DEBUG)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger for a specific module."""
    return logging.getLogger(name)


# Initialize logging on module import
setup_logging()
