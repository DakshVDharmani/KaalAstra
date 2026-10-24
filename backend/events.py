import time
from typing import Any, Dict, Optional, Callable
from pydantic import BaseModel, Field

class PipelineEvent(BaseModel):
    event_type: str
    stage: str
    message: str
    data: Dict[str, Any] = Field(default_factory=dict)
    timestamp: float = Field(default_factory=time.time)

# Callback type for event listeners
EventCallback = Callable[[PipelineEvent], None]

class EventBus:
    def __init__(self):
        self._listeners = []

    def subscribe(self, callback: EventCallback):
        self._listeners.append(callback)

    def unsubscribe(self, callback: EventCallback):
        if callback in self._listeners:
            self._listeners.remove(callback)

    def emit(self, event_type: str, stage: str, message: str, data: Optional[Dict[str, Any]] = None):
        event = PipelineEvent(
            event_type=event_type,
            stage=stage,
            message=message,
            data=data or {}
        )
        for listener in self._listeners:
            try:
                listener(event)
            except Exception as e:
                # Listeners should not crash the pipeline
                pass
        return event

