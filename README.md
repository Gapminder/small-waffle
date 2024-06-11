# small-waffle

//entity request
http://localhost:3333/fasttrack/aaaf2d7?_language=en&select_key@=geo;&value@=world/_4region&=is--world/_4region;;&from=entities&where_$or@_un/_state:true

//example of a datapoint request
http://localhost:3333/fasttrack/aaaf2d7?_language=en&select_key@=geo&=time;&value@=pop&=lex&=gdp/_pcap;;&from=datapoints&where_geo=$geo;&join_$geo_key=geo&where_$or@_un/_state:true

//example of a concept schema request
http://localhost:3333/fasttrack/aaaf2d7?_select_key@=key&=value;&value@;;&from=concepts.schema

//example of a datapoint schema request
http://localhost:3333/fasttrack/aaaf2d7?_select_key@=key&=value;&value@;;&from=datapoints.schema
