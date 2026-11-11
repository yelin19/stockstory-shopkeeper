# Thai address data: sources and coverage

## Administrative names and codes

The app's province, district, and subdistrict lookup is based on Thailand Geography JSON release **v1.3.0 (2026-10-28)**. Its published files list 77 province-level units (including Bangkok), 928 districts/amphoes and khets, and 7,436 tambons/khwaeng. Its changelog says English names were aligned to a Department of Provincial Administration registry dated 1 September 2023. The project's administrative-code lists were cross-checked against that release; codes remain strings so leading zeroes are preserved.

The 77 Thai province abbreviations follow the Department of Skill Development PDF titled “รายชื่ออักษรย่อของจังหวัด และรหัสจังหวัด (อ้างอิงจากมหาดไทย),” the reference the shop owner supplied. The province codes are the two-digit DOPA codes. Thai names and abbreviations were checked against the source list, with province-code/name pairs cross-checked against the upstream province list.

The Department of Provincial Administration's explicit nationwide count is older: 76 provinces, 878 amphoes and 7,255 tambons as of 31 December 2018; its notice explains that Bangkok is a special local-government form, not one of the 76 provinces. Bangkok Metropolitan Administration's official material identifies 50 khets and 180 khwaeng. Thus a current national province-level list counts Bangkok alongside the 76 provinces, and combines current Bangkok units with DOPA's dated 76-province figures. These counts should not be misrepresented as a single newly issued 2026 DOPA census.

## Postal codes and exceptions

The bundled subdistrict records include all postcode options represented in the reviewed upstream release, not only one code per subdistrict. Release v1.3.0 lists 7,350 subdistricts with one code and 86 with multiple codes; 83 have two choices and three have three. The exception records preserve Thai descriptions such as moo/village ranges and street/house-number coverage so customers can select a postcode matching their delivery area.

The upstream project's exception audit is derived from Thailand Post's nationwide locality poster, whose own footer dates the data to May 2018. Thailand Post has published later changes. For example, its 8 June 2020 notice changed five Fao Rai-district tambons in Nong Khai from 43120 to 43230; that correction appears in the v1.3.0 data. A second notice changed Khun Nan tambon, Nan, from 55130 to 55220. Upstream release notes also document subsequent postcode corrections and mark the majority-area code as primary.

Thailand Post provides an address-based postcode lookup and an official nationwide poster, but this audit did not find an official, current, machine-readable national postcode master or API. Therefore the bundled list is a structured point-in-time lookup against the cited upstream release, with later published changes incorporated there; it is not a guarantee that every assignment is a live Thailand Post database snapshot. When the poster supplies several codes for one subdistrict, the user interface exposes the locality description instead of pretending that one postcode always fits.

## References

- [1] [Thailand Geography JSON v1.3.0](https://github.com/thailand-geography-data/thailand-geography-json/tree/v1.3.0) — provinces, districts, subdistricts, multiple-postcode audit and MIT license.
- [2] [Thailand Geography JSON changelog](https://github.com/thailand-geography-data/thailand-geography-json/blob/v1.3.0/CHANGELOG.md) — 2026 corrections, coverage counts and postal-code update history.
- [3] [Department of Skill Development province abbreviations and Ministry of Interior codes PDF](https://www.dsd.go.th/Content/themes/Files/754_File_%E0%B8%AD%E0%B8%B1%E0%B8%81%E0%B8%A9%E0%B8%A3%E0%B8%A2%E0%B9%88%E0%B8%AD%20%E0%B8%88%E0%B8%B1%E0%B8%87%E0%B8%AB%E0%B8%A7%E0%B8%B1%E0%B8%94_03062559151532_.pdf) — owner-supplied abbreviation reference.
- [4] [Thailand Post nationwide postal-code poster](https://file.thailandpost.com/upload/content/_5e856abf6c77a.pdf) — locality exceptions; poster status May 2018.
- [5] [Thailand Post Fao Rai postal-code change notice](https://www.thailandpost.co.th/un/article_detail/article/11/18034) — five tambons changed to 43230 in 2020.
- [6] [Thailand Post Khun Nan postal-code change notice](https://www.thailandpost.co.th/un/article_detail/article/11/18909) — changed to 55220 in 2020.
- [7] [Thailand Post postcode lookup](https://www.thailandpost.co.th/index.php?page=search_zipcode&language=en) — address-based verification.
- [8] [Ministry of Interior standard administrative area codes](https://moi.go.th/moi/%E0%B8%A3%E0%B8%AB%E0%B8%B1%E0%B8%AA%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B8%A3%E0%B8%90%E0%B8%B2%E0%B8%99%E0%B9%80%E0%B8%82%E0%B8%95%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%9B%E0%B8%81%E0%B8%84%E0%B8%A3%E0%B8%AD/) — official code standard and links to code tables.
- [9] [DOPA administrative counts as of 31 December 2018](https://multi.dopa.go.th/secofdopa/news/cate10/view148) — 76 provinces, 878 amphoes and 7,255 tambons; Bangkok excluded as a special local-government form.
- [10] [Bangkok Metropolitan Administration 50-district map](https://district.bangkok.go.th/SEDPortal/50-map-overview/) — official current 50-khet map.
