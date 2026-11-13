#!/usr/bin/env python3
"""Read-only Canon GX7100 SNMPv1 copy meter, no print jobs or document contents.

Shipped persistently in Enfoque OS; uses only SNMP GET on known printer endpoints.
The confirmed table exposes *labels* and *counter values* in adjacent columns:
1.3.6.1.4.1.1602.1.11.2.1.1.{2=label,3=count}.{index}
Index 17: Copy (Total 1), 25: Print (Total 1), 1: Total 1.
"""
import json
import socket
from datetime import datetime, timezone

PORT = 161
COMMUNITY = b"public"

def tlv(tag, value):
    n = len(value)
    if n >= 128:
        raw = n.to_bytes((n.bit_length()+7)//8, "big")
        prefix = bytes([0x80|len(raw)])+raw
    else:
        prefix = bytes([n])
    return bytes([tag])+prefix+value

def vint(n):
    if n < 0 or n >= 128:
        raise ValueError("Unsupported integer")
    return tlv(2, bytes([n]))

def oid_part(value):
    result = [value & 127]
    value >>= 7
    while value:
        result.insert(0, 128 | (value & 127))
        value >>= 7
    return bytes(result)

def encode_oid(text):
    pieces = list(map(int, text.split(".")))
    return tlv(6, bytes([40*pieces[0]+pieces[1]])+
               b"".join(oid_part(value) for value in pieces[2:]))

def read_tlv(data, position=0):
    if position >= len(data):
        raise ValueError("Truncated SNMP response")
    kind = data[position]
    position += 1
    length = data[position]
    position += 1
    if length & 128:
        count = length & 127
        if count < 1 or count > 4:
            raise ValueError("Invalid SNMP length")
        length = int.from_bytes(data[position:position+count], "big")
        position += count
    if position+length > len(data):
        raise ValueError("Invalid SNMP packet")
    return kind, data[position:position+length], position+length

def decode_oid(raw):
    if not raw:
        raise ValueError("Empty OID")
    out = [raw[0] // 40, raw[0] % 40]
    number = 0
    for char in raw[1:]:
        number = (number << 7) | (char & 127)
        if not(char & 128):
            out.append(number)
            number = 0
    return ".".join(map(str,out))

def snmp_read(host, oid):
    body = tlv(0x30,encode_oid(oid)+tlv(0x05,b""))
    pdu = tlv(0xa0,vint(34)+vint(0)+vint(0)+tlv(0x30,body))
    message = tlv(0x30,vint(0)+tlv(0x04,COMMUNITY)+pdu)
    conn = socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    conn.settimeout(2.2)
    try:
        conn.sendto(message,(host,PORT))
        packet,peer = conn.recvfrom(8192)
        if peer != (host,PORT):
            raise ValueError("Unexpected printer response")
        kind,outer,_ = read_tlv(packet)
        if kind != 0x30:
            raise ValueError("Not an SNMP message")
        _,version,pos = read_tlv(outer)
        _,community,pos = read_tlv(outer,pos)
        kind,response,_ = read_tlv(outer,pos)
        if kind != 0xa2 or int.from_bytes(version,"big") != 0:
            raise ValueError("Wrong SNMP version")
        _,request,pos = read_tlv(response)
        _,error,pos = read_tlv(response,pos)
        _,index,pos = read_tlv(response,pos)
        if int.from_bytes(request,"big") != 34 or community != COMMUNITY or int.from_bytes(error,"big") != 0:
            raise ValueError("SNMP query rejected")
        _,bindings,pos = read_tlv(response,pos)
        _,first,_ = read_tlv(bindings)
        _,oid_raw,pos = read_tlv(first)
        kind,value,pos = read_tlv(first,pos)
        if decode_oid(oid_raw) != oid:
            raise ValueError("SNMP OID mismatch")
        if kind in (0x02,0x41,0x42,0x46):
            return int.from_bytes(value,"big",signed=(kind == 0x02))
        if kind == 0x04:
            return value.decode("utf-8","replace").strip()
        raise ValueError("Unexpected SNMP data type")
    finally:
        conn.close()

def meter(host,index,label):
    base="1.3.6.1.4.1.1602.1.11.2.1.1"
    received_label=snmp_read(host,base+".2."+str(index))
    if received_label != label:
        raise ValueError("Canon counter description changed")
    number=snmp_read(host,base+".3."+str(index))
    if not isinstance(number,int) or number<0 or number>10**9:
        raise ValueError("Invalid Canon counter")
    return number

def read_metrics(host):
    model=snmp_read(host,"1.3.6.1.2.1.1.1.0")
    if not isinstance(model,str) or not model or len(model)>2048:
        raise ValueError("No printer description")
    if "Canon GX7100 series" in model:
        total=meter(host,1,"Total 1")
        copies=meter(host,17,"Copy (Total 1)")
        printed=meter(host,25,"Print (Total 1)")
        if copies+printed!=total:raise ValueError("Canon total mismatch")
        return {"model":"Canon GX7100 series","profile":"canon-gx7100",
                "totalPages":total,"printPages":printed,"copyPages":copies,"source":"physical-snmp"}
    if snmp_read(host,"1.3.6.1.2.1.43.10.2.1.3.1.1")!=7:
        raise ValueError("Printer counter unit is not impressions")
    total=snmp_read(host,"1.3.6.1.2.1.43.10.2.1.4.1.1")
    if type(total)!=int or not 0<=total<=10**9:raise ValueError("Invalid total")
    try:serial=snmp_read(host,"1.3.6.1.2.1.43.5.1.1.17.1")
    except (OSError,ValueError,IndexError):serial=""
    if "hp" in model.lower():
        try:
            ident=snmp_read(host,"1.3.6.1.4.1.11.2.3.9.1.1.7.0")
            if isinstance(ident,str):
                fields=dict(part.split(":",1) for part in ident.split(";") if ":" in part)
                if fields.get("MFG")=="HP" and fields.get("MDL") and fields.get("SN"):
                    model,serial=fields["MDL"],fields["SN"]
        except (OSError,ValueError,IndexError):
            pass
    return {"model":model[:160],"serial":str(serial)[:100],"profile":"printer-mib",
            "totalPages":total,"source":"physical-snmp"}
