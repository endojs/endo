export interface AsyncSpring<TGet> {
  get(): Promise<TGet>;
}

export interface AsyncSink<TPut> {
  put(value: TPut | Promise<TPut>): void;
}

export interface AsyncQueue<TGet, TPut = TGet>
  extends AsyncSpring<TPut>,
    AsyncSink<TGet> {}

// Stream is nearly identical to AsyncGenerator and AsyncGenerator should
// probably be identical to this definition of Stream.
// Stream does not make the mistake of conflating the read and write return
// types.
export interface Stream<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
> {
  next(value: TWrite): Promise<IteratorResult<TRead, TReadReturn>>;
  return(value: TWriteReturn): Promise<IteratorResult<TRead, TReadReturn>>;
  throw(error: Error): Promise<IteratorResult<TRead, TReadReturn>>;
  [Symbol.asyncIterator](): Stream<TRead, TWrite, TReadReturn, TWriteReturn>;
}

export type Reader<TRead, TReadReturn = undefined> = Stream<
  TRead,
  undefined,
  TReadReturn,
  undefined
>;
export type Writer<TWrite, TWriteReturn = undefined> = Stream<
  undefined,
  TWrite,
  undefined,
  TWriteReturn
>;
