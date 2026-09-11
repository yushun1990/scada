# Inspector hierarchy

2026-09-10 correction: the following Base / Properties / Methods / Events layout records an earlier design. The current UI audit found divergence from it. The target Inspector structure is now defined in [Industrial Designer UI Specification, section 7](../design/industrial-designer-spec.md#7-属性检查器): selection context, search, configuration/actions/events where applicable, and grouped property rows. Object commands belong to shared menus/toolbars and context menus. The Attribute / Property authority split remains unchanged.

The right inspector separates object commands from editable configuration.

- Base contains commands only: duplicate, delete, reset, group, ungroup, align, and distribute.
- Properties contains identity, geometry, visibility, connection style, scene settings, and component-specific properties.
- Methods and Events remain sibling semantic tabs below Base.

The property panel uses one vertical scroll container so semantic tabs cannot be hidden by an independently scrolling Base section.
