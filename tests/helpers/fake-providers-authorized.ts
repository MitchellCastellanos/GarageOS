// Importar SOLO desde tests que sustituyen TODO proveedor externo por un fake / stub.
// Autoriza los efectos salientes (PROVIDER_SIDE_EFFECTS=enabled) para que el código bajo prueba llegue hasta
// el fake. Ningún test que importe esto puede usar credenciales reales: los tests fijan claves de mentira
// (sk_test_x, ACparent, re_test_key…) y reemplazan el método del SDK o `fetch`.
process.env.PROVIDER_SIDE_EFFECTS = "enabled";
