# Discogs dump fixtures

Hand-written in the shape of Discogs' monthly CC0 data dumps (data.discogs.com), for the
catalogue build's tests (ADR 0012). They are tiny and invented, and each record is there
to exercise one rule:

- master 100: three versions, two of them vinyl, with release-level and track-level
  credits, a "(3)" name suffix and a credit that is paperwork (Design), not a person
  who shaped the sound
- master 200: CD only, so it must not reach the catalogue
- master 300: one vinyl version
- master 400: an LP-and-CD box set (counts as vinyl), accented names, a "(2)" artist
  suffix and an unknown year (0)
- release 9: no master at all
- master 999: in the releases dump but missing from the masters dump
