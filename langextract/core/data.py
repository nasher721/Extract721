from __future__ import annotations
from typing import Union, Optional, List, Dict, Any, Sequence, Set, Tuple
# Copyright 2025 Google LLC.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Classes used to represent core data types of annotation pipeline."""

import dataclasses
import enum
import uuid

from langextract.core import tokenizer
from langextract.core import types

FormatType = types.FormatType  # Backward compat

EXTRACTIONS_KEY = "extractions"
ATTRIBUTE_SUFFIX = "_attributes"

__all__ = [
    "AlignmentStatus",
    "CharInterval",
    "Extraction",
    "Document",
    "AnnotatedDocument",
    "ExampleData",
    "FormatType",
    "EXTRACTIONS_KEY",
    "ATTRIBUTE_SUFFIX",
]


class AlignmentStatus(enum.Enum):
  MATCH_EXACT = "match_exact"
  MATCH_GREATER = "match_greater"
  MATCH_LESSER = "match_lesser"
  MATCH_FUZZY = "match_fuzzy"


@dataclasses.dataclass
class CharInterval:
  """Class for representing a character interval.

  Attributes:
    start_pos: The starting position of the interval (inclusive).
    end_pos: The ending position of the interval (exclusive).
  """

  start_pos: Optional[int] = None
  end_pos: Optional[int] = None


@dataclasses.dataclass(init=False)
class Extraction:
  """Represents an extraction extracted from text.

  This class encapsulates an extraction's characteristics and its position
  within the source text. It can represent a diverse range of information for
  NLP information extraction tasks.

  Attributes:
    extraction_class: The class of the extraction.
    extraction_text: The text of the extraction.
    char_interval: The character interval of the extraction in the original
      text.
    alignment_status: The alignment status of the extraction.
    extraction_index: The index of the extraction in the list of extractions.
    group_index: The index of the group the extraction belongs to.
    description: A description of the extraction.
    attributes: A list of attributes of the extraction.
    token_interval: The token interval of the extraction.
  """

  extraction_class: str
  extraction_text: str
  char_interval: Optional[CharInterval] = None
  alignment_status: Optional[AlignmentStatus] = None
  extraction_index: Optional[int] = None
  group_index: Optional[int] = None
  description: Optional[str] = None
  attributes: Dict[str, Union[str, Optional[List[str]]]] = None
  _token_interval: Optional[tokenizer.TokenInterval] = dataclasses.field(
      default=None, repr=False, compare=False
  )

  def __init__(
      self,
      extraction_class: str,
      extraction_text: str,
      *,
      token_interval: Optional[tokenizer.TokenInterval] = None,
      char_interval: Optional[CharInterval] = None,
      alignment_status: Optional[AlignmentStatus] = None,
      extraction_index: Optional[int] = None,
      group_index: Optional[int] = None,
      description: Optional[str] = None,
      attributes: Dict[str, Union[str, Optional[List[str]]]] = None,
  ):
    self.extraction_class = extraction_class
    self.extraction_text = extraction_text
    self.char_interval = char_interval
    self._token_interval = token_interval
    self.alignment_status = alignment_status
    self.extraction_index = extraction_index
    self.group_index = group_index
    self.description = description
    self.attributes = attributes

  @property
  def token_interval(self) -> Optional[tokenizer.TokenInterval]:
    return self._token_interval

  @token_interval.setter
  def token_interval(self, value: Optional[tokenizer.TokenInterval]) -> None:
    self._token_interval = value


@dataclasses.dataclass
class Document:
  """Document class for annotating documents.

  Attributes:
    text: Raw text representation for the document.
    document_id: Unique identifier for each document and is auto-generated if
      not set.
    additional_context: Additional context to supplement prompt instructions.
    tokenized_text: Tokenized text for the document, computed from `text`.
  """

  text: str
  additional_context: Optional[str] = None
  _document_id: Optional[str] = dataclasses.field(
      default=None, init=False, repr=False, compare=False
  )
  _tokenized_text: Optional[tokenizer.TokenizedText] = dataclasses.field(
      init=False, default=None, repr=False, compare=False
  )

  def __init__(
      self,
      text: str,
      *,
      document_id: Optional[str] = None,
      additional_context: Optional[str] = None,
  ):
    self.text = text
    self.additional_context = additional_context
    self._document_id = document_id

  @property
  def document_id(self) -> str:
    """Returns the document ID, generating a unique one if not set."""
    if self._document_id is None:
      self._document_id = f"doc_{uuid.uuid4().hex[:8]}"
    return self._document_id

  @document_id.setter
  def document_id(self, value: Optional[str]) -> None:
    """Sets the document ID."""
    self._document_id = value

  @property
  def tokenized_text(self) -> tokenizer.TokenizedText:
    if self._tokenized_text is None:
      self._tokenized_text = tokenizer.tokenize(self.text)
    return self._tokenized_text

  @tokenized_text.setter
  def tokenized_text(self, value: tokenizer.TokenizedText) -> None:
    self._tokenized_text = value


@dataclasses.dataclass
class AnnotatedDocument:
  """Class for representing annotated documents.

  Attributes:
    document_id: Unique identifier for each document - autogenerated if not
      set.
    extractions: List of extractions in the document.
    text: Raw text representation of the document.
    tokenized_text: Tokenized text of the document, computed from `text`.
  """

  extractions: Optional[List[Extraction]] = None
  text: Optional[str] = None
  _document_id: Optional[str] = dataclasses.field(
      default=None, init=False, repr=False, compare=False
  )
  _tokenized_text: Optional[tokenizer.TokenizedText] = dataclasses.field(
      init=False, default=None, repr=False, compare=False
  )

  def __init__(
      self,
      *,
      document_id: Optional[str] = None,
      extractions: Optional[List[Extraction]] = None,
      text: Optional[str] = None,
  ):
    self.extractions = extractions
    self.text = text
    self._document_id = document_id

  @property
  def document_id(self) -> str:
    """Returns the document ID, generating a unique one if not set."""
    if self._document_id is None:
      self._document_id = f"doc_{uuid.uuid4().hex[:8]}"
    return self._document_id

  @document_id.setter
  def document_id(self, value: Optional[str]) -> None:
    """Sets the document ID."""
    self._document_id = value

  @property
  def tokenized_text(self) -> Optional[tokenizer.TokenizedText]:
    if self._tokenized_text is None and self.text is not None:
      self._tokenized_text = tokenizer.tokenize(self.text)
    return self._tokenized_text

  @tokenized_text.setter
  def tokenized_text(self, value: tokenizer.TokenizedText) -> None:
    self._tokenized_text = value


@dataclasses.dataclass
class ExampleData:
  """A single training/example data instance for a structured prompting.

  Attributes:
    text: The raw input text (sentence, paragraph, etc.).
    extractions: A list of Extraction objects extracted from the text.
  """

  text: str
  extractions: List[Extraction] = dataclasses.field(default_factory=list)
