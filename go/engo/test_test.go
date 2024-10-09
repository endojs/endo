package main_test

// eval(`new TextEncoder().encode('Hello, World')`)
//
// {
// 	responseCh := make(chan Message, 1)
// 	supervisor.Deliver(ctx, Message{
// 		Headers: Headers{
// 			Type: "system",
// 			Sync: true,
// 			To:   bindingsId,
// 			From: 0,
// 		},
// 		Body: []byte(`{
//        "method": "readFile",
//        "location": "hello.txt"
//      }`),
// 		ResponseCh: responseCh,
// 	})
// 	res := <-responseCh
// 	txt, _ := json.Marshal(res.Headers)
// 	fmt.Printf("Res: %s\nBody: %s\n", txt, res.Body)
// }
//
// {
// 	responseCh := make(chan Message, 1)
// 	supervisor.Deliver(ctx, Message{
// 		Headers: Headers{
// 			Type: "system",
// 			Sync: true,
// 			To:   bindingsId,
// 			From: 0,
// 		},
// 		Body: []byte(`{
//        "method": "parseUrl",
//        "location": "http://example.com/users/root?search#hash"
//      }`),
// 		ResponseCh: responseCh,
// 	})
// 	res := <-responseCh
// 	txt, _ := json.Marshal(res.Headers)
// 	fmt.Printf("Res: %s\nBody: %s\n", txt, res.Body)
// }
//
// eval(`
//    print(JSON.stringify(new URL('http://example.com/path/to?search#hash')));
//  `)
//
// eval(`
//    print(new TextDecoder().decode(readFileNow('hello.txt')).trim());
//  `)
//
// eval(`
//    throw new Error('bad');
//  `)
//
