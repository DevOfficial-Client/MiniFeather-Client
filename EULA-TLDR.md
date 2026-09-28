# minifeather client — eula en humano (tl;dr)

> [!note]
> esto es la versión fácil y con cariño de la [eula completa](eula.md). divertida, pero igual de seria donde importa.
> versión en español de [eula-tldr.md](eula-tldr.md). this file is also available in english: [eula-tldr.en.md](eula-tldr.en.md)

---

## 1. ¿qué es esto? (・o・)

minifeather es un client hecho por fans de miniblox, para fans de miniblox.
**no tenemos nada que ver con miniblox oficial.** ni nos pagan, ni nos patrocinan, ni nos invitan a la fiesta. (◞‸◟)

también es **w.i.p.** (work in progress), o sea: lo estamos construyendo mientras vuelas. puede haber bugs, cosas a medias, y features que desaparecen de un día para otro. si algo explota... tranquilo, era gratis. ᕙ(⇀‸↼‶)ᕗ

## 2. lo más importante, arriba y en grande

**nadie te obliga a usar el cliente, lo usas porque quieres jaja** (๑>ᴗ<๑)

en serio: si algo sale mal (baneo, bug, susto), la responsabilidad es tuya. nosotros avisamos por todos lados. si no estás de acuerdo con eso, cierra esta pestaña y sigue con tu vida, sin rencores. (~‾⌣‾)~

## 2.5. hablemos de esto: nadie nos paga (╥_╥)

sí, leíste bien: **nadie nos paga por hacer esto.** cero. nada. ni un centavo. lo hacemos gratis, en nuestro tiempo libre, después del trabajo/estudio, dormidos de cansancio, por puro amor al juego. (ᵕ—ᴗ—)

y hablando de dormir: hay noches de código a las 3am. y días que nunca dormimos. literal. el sol sale y ahí seguimos, peleando con un bug que nadie nos pidió arreglar, gratis, mientras el resto del mundo duerme. si el client funciona hoy, es en parte gracias a esas madrugadas de las que nadie se entera. (=_=)

y aun así, hay gente que llega a insultarnos a los devs. por un client gratis. que nadie les obligó a usar. que hicimos sin cobrarles nada. (눈_눈)

si eres de esos: por favor, replantéate tus prioridades. los devs también tienen sentimientos (y café caro). si algo no te gusta, puedes decirlo sin insultar, o mejor aún: **reporta el bug con cariño en discord** y lo miramos. prometemos no llorar. mucho. (˘̩̩̩ε˘̩ƪ)

si eres de los buenos: gracias, de corazón. sois la razón por la que seguimos. ᕦ(ò_óˇ)ᕤ

## 3. lo que no hagas con el cliente ٩(◕‿◕)ノ

- **no lo uses para ventaja injusta en servidores competitivos.** baritone, bots, anti-afk y amigos: úsalos en tu mundo, con tus amigos, donde el servidor lo permita. si te banean por hacer trampa en pvp ranked... bueno... ¯\\\_(ツ)\_/¯
- **no vendas el client ni copias modificadas** haciéndolas pasar por oficiales. eso sí que es feo.
- **no eludas anticheats, pagos ni sistemas de seguridad.** no somos esa clase de proyecto.
- **no acoses a nadie.** ni con ia, ni con bots, ni con nada. se buen citizeño del blob. (｡•́︿•̀｡)

## 4. cosas que conviene saber sobre tus datos ʕ•ᴥ•ʔ

- **acá nadie roba tus datos.** de verdad. para empezar, **ni siquiera pedimos ni guardamos tu contraseña de miniblox**... y pues... para qué carajos queremos una cuenta de miniblox? suficientes problemas tenemos con los bugs. (￣ω￣)
- tus ajustes, waypoints, skins y apodos se guardan **en tu navegador**, sin cifrar. tu pc, tu bóveda.
- el **clientchat y las llamadas** usan canales públicos (ntfy.sh): funcionan como una plaza. **no mandes contraseñas ni datos personales ahí**, cualquiera con el nombre del canal puede leer. (∩`ω´)⊃))
- la **voz** solo pide micrófono si tú aceptas una llamada (`/call on` para activarlo, `/call off` para apagarlo todo).
- si configuras una **api key de ia**, se guarda en texto plano. usa una con límite de gasto, no tu llave maestra.
- github, klipy, peerjs y demás solo ven lo necesario para funcionar (descargas, búsquedas de gifs, etc.).

## 4.2. sobre las cuentas de minifeather (sí, existen, mea culpa, digo porque puse que no antes JAJA)

- **sí hay cuentas de minifeather**, y son **opcionales**: sirven para el ecosistema comunitario (skins, rangos, mascotas compartidas). si nunca creas una, el client funciona igual. nada te obliga.
- **no tienen nada que ver con tu cuenta de miniblox.** es otro universo: usuario y contraseña propios, sin conexión a tu sesión del juego. una cosa por lado. (・_・;)
- cuando creas una, tu contraseña **se guarda hasheada (pbkdf2, 200k iteraciones)** en una base de datos privada. jamás en texto plano en la db.
- **pero seamos honestos:** la petición de creación viaja por ntfy.sh, que es un canal público. por eso: **nunca reutilices la contraseña de tu correo, discord o miniblox aquí.** usa una contraseña única y desechable, duerme tranquilo. (∩`ω´)⊃))
- las cuentas se gestionan por los devs con un bot en discord (vinculación, skins, etc.). si algo se rompe... sección 4.5. ᕕ( ᐛ )ᕗ

## 4.5. sobre bugs y exploits (los no intencionales, obvio)

a veces se nos escapa un bug. o un exploit. **no es intencional**, lo juramos por el café. cuando nos enterramos de que algo está roto o algo se puede abusar, **intentamos arreglarlo y ponemos límites** lo antes posible. (๑•̀ㅂ•́)و

lo que no hagas es quedarte callado abusando del exploit como si no pasara nada: si ves algo raro, avísanos. arreglar antes > explotar después. y si explotas algo a sabiendas... recuerda la sección 3, la de "no seas eso".

## 5. sobre la ia

- **este client se hizo con bastante ayuda de ia.** código, traducciones, docs... la ia fue copiloto. si encuentras un bug raro... sí, probablemente fue la ia. (o yo. ¿quién sabe?) (¬‿¬)
- **verityai** (el asistente del client) puede decir tonterías con total seguridad. no lo tomes como fuente de verdad, ni como abogado, ni como médico. es un loro con acceso a internet.
- si activas el auto-reply, el chat del juego pasa por el proveedor de ia. tú decides.

## 6. actualizaciones y actualizaciones locas

el client se **auto-actualiza desde github** y hasta puede aplicar cambios en caliente (hotload). ¿traducción? a veces se mueve solo mientras no miras. puedes desactivarlo en ajustes, pero entonces tú y los bugs se quedan solos con la versión vieja. (⌐■_■)

## 7. en resumen, el trato es:

| nosotros | tú |
|---|---|
| hacemos un client comunitario gratis, con amor y bugs | lo usas porque quieres, no porque debas |
| avisamos de los riesgos (como ahora) | lees los avisos (como ahora) y no nos demandas |
| podemos cambiar o romper features cuando queramos | nos cuentas los bugs con cariño en discord |
| no respondemos por baneos ni por lo que hagas con el client | juegas justo y no arruinas la partida de otros |

## 8. la frase legal corta

el software se entrega "tal cual", sin garantías. no somos responsables de baneos, pérdidas de datos, daños, ni de lo que decida la ia. la versión completa y aburrida (pero vinculante) está en la [eula completa](eula.md). si algo de este tl;dr contradice a la completa, gana la completa. siempre. período. ᕕ( ᐛ )ᕗ

---

gracias por leer hasta aquí. de verdad. eres de los que leen. (っ˘ω˘ς)

¿encontraste un bug? ¿tienes una idea? ¿solo quieres pasar el rato?
**[discord](https://discord.gg/k4Ku9DTQDQ)**

recuerda: **nadie te obliga a usar el cliente, lo usas porque quieres jaja** ᕦ(ò_óˇ)ᕤ
