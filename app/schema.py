from pydantic import BaseModel, Field


class CollectIn(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=32)
    path: str = Field(default="", max_length=255)
    title: str = Field(default="", max_length=255)
    referrer: str = Field(default="", max_length=255)
    session: str = Field(default="", max_length=64)
    me: bool = False
    lang: str = Field(default="", max_length=16)
    screen: str = Field(default="", max_length=32)
    props: dict[str, str | int | float | bool | None] | None = None
