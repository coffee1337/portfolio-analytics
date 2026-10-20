from pydantic import BaseModel, Field
import json


class CollectIn(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=32)
    path: str = Field(default="", max_length=255)
    title: str = Field(default="", max_length=255)
    referrer: str = Field(default="", max_length=512)
    session: str = Field(default="", max_length=64)
    visitor: str = Field(default="", max_length=40)
    me: bool = False
    lang: str = Field(default="", max_length=16)
    screen: str = Field(default="", max_length=32)
    props: dict[str, str | int | float | bool | None] | None = None

    @classmethod
    def model_validate_json(cls, raw, **kwargs):
        data = json.loads(raw)
        props = data.get("props")
        if isinstance(props, dict):
            for key in ("session", "me", "visitor", "lang", "screen"):
                if not data.get(key) and props.get(key) not in (None, ""):
                    data[key] = props[key]
            if not data.get("session") and props.get("sid"):
                data["session"] = props["sid"]
        return cls.model_validate(data)
